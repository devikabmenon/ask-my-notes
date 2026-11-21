import asyncio
import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from google.genai import types
from websockets.exceptions import ConnectionClosed

from live_config import gemini, MODEL, CONFIG, answer_tool_call

router = APIRouter()


@router.websocket("/voice")
async def voice(ws: WebSocket):
    await ws.accept()

    try:
        async with gemini.aio.live.connect(
            model=MODEL,
            config=CONFIG
        ) as session:

            # Browser microphone audio -> Gemini
            async def browser_to_gemini():
                while True:
                    try:
                        pcm = await ws.receive_bytes()
                    except WebSocketDisconnect:
                        return

                    await session.send_realtime_input(
                        audio=types.Blob(
                            data=pcm,
                            mime_type="audio/pcm;rate=16000"
                        )
                    )

            # Gemini responses -> browser
            async def gemini_to_browser():
                try:
                    async for response in session.receive():

                        # Gemini wants to call our search_notes tool
                        if response.tool_call:
                            await answer_tool_call(session, response.tool_call)

                        content = response.server_content

                        if not content:
                            continue

                        # User interrupted Gemini while it was talking
                        if content.interrupted:
                            await safe_send(ws, {"type": "interrupted"})
                            continue

                        # Spoken audio from Gemini (raw PCM, 24kHz)
                        if response.data:
                            await ws.send_bytes(response.data)

                        # Show what the user said
                        if content.input_transcription:
                            await safe_send(ws, {
                                "type": "user",
                                "text": content.input_transcription.text
                            })

                        # Show Gemini's captions
                        if content.output_transcription:
                            await safe_send(ws, {
                                "type": "caption",
                                "text": content.output_transcription.text
                            })

                        # Gemini finished its turn
                        if content.turn_complete:
                            await safe_send(ws, {"type": "done"})
                except ConnectionClosed:
                    return

            send_task = asyncio.create_task(browser_to_gemini())
            receive_task = asyncio.create_task(gemini_to_browser())

            # Wait until either side finishes, then stop the other one
            done, pending = await asyncio.wait(
                {send_task, receive_task},
                return_when=asyncio.FIRST_COMPLETED
            )

            for task in pending:
                task.cancel()

            # Let cancellations settle
            await asyncio.gather(*pending, return_exceptions=True)

    except (WebSocketDisconnect, ConnectionClosed):
        # Browser closed the tab or lost connection - normal
        pass
    except Exception as e:
        # Tell the browser something went wrong, then close cleanly
        await safe_send(ws, {"type": "error", "text": str(e)})


async def safe_send(ws: WebSocket, message: dict):
    """Send a JSON message, ignoring errors if the browser already left."""
    try:
        await ws.send_text(json.dumps(message))
    except Exception:
        pass