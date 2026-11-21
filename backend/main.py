# main.py - Ask My Notes Backend with AI Quiz Generator
# Updated for Day 3 - Groq model update

import os
import json
from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from groq import Groq

from ingest import collection, add_pdf
from voice import router as voice_router


# Read API key from .env
load_dotenv()

ai = Groq(api_key=os.getenv("GROQ_API_KEY"))

# Updated Groq model for Day 3
MODEL = "openai/gpt-oss-120b"


# Create FastAPI app
app = FastAPI()


# Allow React frontend to communicate with backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register the live voice assistant WebSocket (/voice)
app.include_router(voice_router)


# Request formats
class Question(BaseModel):
    question: str


class QuizRequest(BaseModel):
    topic: str = "important concepts from my notes"
    num_questions: int = Field(default=5, ge=1, le=10)


# GET - Check backend status
@app.get("/")
def home():
    return {
        "status": "running",
        "pieces": collection.count()
    }


# POST - Ask a question from notes
@app.post("/ask")
def ask(q: Question):

    # 1. Check if notes exist
    if collection.count() == 0:
        raise HTTPException(
            status_code=400,
            detail="No notes found. Please upload a PDF first."
        )

    # 2. Find relevant notes
    results = collection.query(
        query_texts=[q.question],
        n_results=min(4, collection.count())
    )

    pieces = results["documents"][0]
    sources = results["metadatas"][0]

    # 3. Prepare context
    notes = "\n\n".join(pieces)

    prompt = f"""Answer the question using ONLY these notes.
If the answer is not in the notes, say "Not found in your notes."

Notes:
{notes}

Question: {q.question}"""

    # 4. Generate answer using Groq AI
    try:
        reply = ai.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "user", "content": prompt}
            ],
            temperature=0.2,
        )

        answer = reply.choices[0].message.content

        return {
            "answer": answer,
            "sources": sources
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Answer generation failed: {str(e)}"
        )


# POST - Upload a PDF
@app.post("/upload")
def upload(file: UploadFile):

    # 1. Check file type
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail="Only PDF files are allowed."
        )

    # 2. Prepare filename and folder
    name = os.path.basename(file.filename)

    os.makedirs("docs", exist_ok=True)

    path = os.path.join("docs", name)

    # 3. Save PDF
    try:
        with open(path, "wb") as f:
            f.write(file.file.read())

        # 4. Process PDF
        count = add_pdf(path)

        return {
            "message": f"Added {name} ({count} pieces). Ask me!"
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"PDF processing failed: {str(e)}"
        )


# POST - Generate AI Quiz
@app.post("/generate-quiz")
def generate_quiz(q: QuizRequest):

    # 1. Check if notes exist
    if collection.count() == 0:
        raise HTTPException(
            status_code=400,
            detail="No notes found. Please upload a PDF first."
        )

    # 2. Retrieve relevant notes
    results = collection.query(
        query_texts=[q.topic],
        n_results=min(8, collection.count())
    )

    pieces = results["documents"][0]

    if not pieces:
        raise HTTPException(
            status_code=404,
            detail="No relevant notes found."
        )

    notes = "\n\n".join(pieces)

    # 3. Ask AI to generate MCQs
    prompt = f"""
You are an educational quiz generator.

Generate exactly {q.num_questions} multiple-choice questions
based ONLY on the notes given below.

Topic: {q.topic}

Rules:
- Each question must have exactly 4 options.
- Only one option must be correct.
- Questions should test understanding, not just memorization.
- Do not use information outside the provided notes.
- Include a short explanation for each correct answer.
- Return ONLY valid JSON.
- Do not include Markdown or code blocks.

Required JSON format:

{{
    "quiz": [
        {{
            "question": "Question text",
            "options": [
                "Option A",
                "Option B",
                "Option C",
                "Option D"
            ],
            "answer": "Option A",
            "explanation": "Explanation of the correct answer"
        }}
    ]
}}

Notes:
{notes}
"""

    # 4. Generate quiz using Groq
    try:
        reply = ai.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "user", "content": prompt}
            ],
            temperature=0.3,
        )

        content = reply.choices[0].message.content

        # 5. Clean AI response
        content = content.strip()

        if content.startswith("```"):
            content = content.replace("```json", "", 1)
            content = content.replace("```", "")
            content = content.strip()

        # 6. Convert AI response into JSON
        quiz_data = json.loads(content)

        quiz = quiz_data.get("quiz", [])

        if not quiz:
            raise ValueError("Quiz was empty.")

        return {
            "topic": q.topic,
            "quiz": quiz
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Quiz generation failed: {str(e)}"
        )