# agent_scratch.py - An agent built by hand

import os
import json
from dotenv import load_dotenv
from groq import Groq

from tools import SYSTEM_PROMPT, search_notes, calculate, today, add_task

load_dotenv()

ai = Groq(api_key=os.getenv("GROQ_API_KEY"))

MODEL = "openai/gpt-oss-120b"

# The tools the agent may use
TOOLS = {
    "search_notes": search_notes,
    "calculate": calculate,
    "today": today,
    "add_task": add_task
}


# Describe each tool to the AI
def describe(fn, **params):

    props = {
        p: {"type": "string", "description": d}
        for p, d in params.items()
    }

    return {
        "type": "function",
        "function": {
            "name": fn.__name__,
            "description": fn.__doc__,
            "parameters": {
                "type": "object",
                "properties": props,
                "required": list(params)
            }
        }
    }


# List of available tools
TOOL_LIST = [
    describe(search_notes, query="What to look for in the notes"),
    describe(calculate, expression="Maths to work out, like 2*(3+4)"),
    describe(today),
    describe(add_task, task="The task to do", due="When it is due"),
]


# Agent thinking loop
def run_agent(question, max_steps=6):

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": question}
    ]

    for step in range(max_steps):

        # 1. THINK
        reply = ai.chat.completions.create(
            model=MODEL,
            messages=messages,
            tools=TOOL_LIST
        )

        msg = reply.choices[0].message

        # If no tool is needed, return the answer
        if not msg.tool_calls:
            return msg.content

        # Store tool requests
        messages.append({
            "role": "assistant",
            "content": msg.content or "",
            "tool_calls": [
                {
                    "id": c.id,
                    "type": "function",
                    "function": {
                        "name": c.function.name,
                        "arguments": c.function.arguments
                    }
                }
                for c in msg.tool_calls
            ]
        })

        # 2. ACT
        for call in msg.tool_calls:

            name = call.function.name
            args = json.loads(call.function.arguments or "{}")

            print(f"🛠 {name}({args})")

            try:
                result = TOOLS[name](**args)
            except Exception as e:
                result = f"Tool error: {e}"

            print(f"👀 {result[:100]}")

            # 3. OBSERVE
            messages.append({
                "role": "tool",
                "tool_call_id": call.id,
                "name": name,
                "content": result
            })

    return "Sorry, that took too many steps. Try a simpler question."


# Main program
if __name__ == "__main__":

    while True:

        question = input("\nYou: ")

        if question.lower() in ("quit", "exit"):
            break

        print("Agent:", run_agent(question))