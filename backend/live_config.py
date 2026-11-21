import os
from dotenv import load_dotenv
from google import genai
from google.genai import types

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

MODEL = "gemini-2.5-flash-native-audio-preview-12-2025"
VOICE = "Aoede"

# Create Gemini client
# The Live API is only served on the v1alpha endpoint.
# (Without this the WebSocket returns HTTP 404.)
gemini = genai.Client(
    api_key=GEMINI_API_KEY,
    http_options={"api_version": "v1alpha"}
)

# Voice configuration
CONFIG = types.LiveConnectConfig(
    response_modalities=["AUDIO"],
    speech_config=types.SpeechConfig(
        voice_config=types.VoiceConfig(
            prebuilt_voice_config=types.PrebuiltVoiceConfig(
                voice_name=VOICE
            )
        )
    ),
    tools=[
        types.Tool(
            function_declarations=[
                types.FunctionDeclaration(
                    name="search_notes",
                    description="Search the uploaded study notes for relevant information.",
                    parameters={
                        "type": "OBJECT",
                        "properties": {
                            "query": {
                                "type": "STRING",
                                "description": "The topic or question to search in the notes."
                            }
                        },
                        "required": ["query"]
                    }
                )
            ]
        )
    ]
)

from ingest import collection

# Search uploaded notes
def search_notes(query: str):
    if collection.count() == 0:
        return "No notes have been uploaded yet."

    results = collection.query(
        query_texts=[query],
        n_results=min(4, collection.count())
    )

    pieces = results["documents"][0]

    if not pieces:
        return "No relevant information found in the notes."

    return "\n\n".join(pieces)

# Handle Gemini tool calls
async def answer_tool_call(session, tool_call):
    function_responses = []

    for fc in tool_call.function_calls:
        if fc.name == "search_notes":
            query = fc.args.get("query", "")
            result = search_notes(query)

            function_responses.append(
                types.FunctionResponse(
                    id=fc.id,
                    name=fc.name,
                    response={"result": result}
                )
            )

    if function_responses:
        await session.send_tool_response(
            function_responses=function_responses
        )