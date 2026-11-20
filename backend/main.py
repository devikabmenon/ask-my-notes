# main.py - Ask My Notes Backend

import os
from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from groq import Groq

from ingest import collection, add_pdf


# Read API key from .env
load_dotenv()
ai = Groq(api_key=os.getenv("GROQ_API_KEY"))


# Create FastAPI app
app = FastAPI()


# Allow React frontend to communicate with backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# Question format
class Question(BaseModel):
    question: str


# GET - Check backend status
@app.get("/")
def home():
    return {
        "status": "running",
        "pieces": collection.count()
    }


# POST - Ask a question
@app.post("/ask")
def ask(q: Question):

    # 1. FIND relevant notes
    results = collection.query(
        query_texts=[q.question],
        n_results=4
    )

    pieces = results["documents"][0]
    sources = results["metadatas"][0]

    # 2. ADD notes and question
    notes = "\n\n".join(pieces)

    prompt = f"""Answer the question using ONLY these notes.
If the answer is not in the notes, say "Not found in your notes."

Notes:
{notes}

Question: {q.question}"""

    # 3. ANSWER using Groq AI
    reply = ai.chat.completions.create(
        model="openai/gpt-oss-20b",
        messages=[
            {"role": "user", "content": prompt}
        ],
        temperature=0.2,
    )

    answer = reply.choices[0].message.content

    # Return answer and sources
    return {
        "answer": answer,
        "sources": sources
    }


# BONUS: Upload a PDF
@app.post("/upload")
def upload(file: UploadFile):

    name = os.path.basename(file.filename)
    path = os.path.join("docs", name)

    with open(path, "wb") as f:
        f.write(file.file.read())

    count = add_pdf(path)

    return {
        "message": f"Added {name} ({count} pieces). Ask me!"
    }