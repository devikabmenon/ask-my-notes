import asyncio
import pyaudio
from google import genai
from google.genai import types
from live_config import GEMINI_API_KEY, MODEL, VOICE

if not GEMINI_API_KEY:
    raise SystemExit(
        "GEMINI_API_KEY is missing. Add it to backend/.env "
        "(get one at https://aistudio.google.com/apikey)."
    )

# The Live API is served on the v1alpha endpoint.
client = genai.Client(
    api_key=GEMINI_API_KEY,
    http_options={"api_version": "v1alpha"},
)

FORMAT = pyaudio.paInt16
CHANNELS = 1
INPUT_RATE = 16000
OUTPUT_RATE = 24000
CHUNK = 1024

audio = pyaudio.PyAudio()

mic = audio.open(
    format=FORMAT,
    channels=CHANNELS,
    rate=INPUT_RATE,
    input=True,
    frames_per_buffer=CHUNK
)

speaker = audio.open(
    format=FORMAT,
    channels=CHANNELS,
    rate=OUTPUT_RATE,
    output=True
)


async def main():
    config = types.LiveConnectConfig(
        response_modalities=["AUDIO"],
        speech_config=types.SpeechConfig(
            voice_config=types.VoiceConfig(
                prebuilt_voice_config=types.PrebuiltVoiceConfig(
                    voice_name=VOICE
                )
            )
        )
    )

    async with client.aio.live.connect(
        model=MODEL,
        config=config
    ) as session:

        print("Gemini Live is ready! Speak into your microphone.")
        print("Press Ctrl+C to stop.")

        async def send_audio():
            while True:
                data = await asyncio.to_thread(
                    mic.read, CHUNK, exception_on_overflow=False
                )
                await session.send_realtime_input(
                    audio=types.Blob(
                        data=data,
                        mime_type="audio/pcm;rate=16000"
                    )
                )

        async def receive_audio():
            async for response in session.receive():
                if response.data:
                    speaker.write(response.data)

        await asyncio.gather(
            send_audio(),
            receive_audio()
        )


try:
    asyncio.run(main())
except KeyboardInterrupt:
    print("\nVoice agent stopped.")
finally:
    mic.stop_stream()
    mic.close()
    speaker.stop_stream()
    speaker.close()
    audio.terminate()