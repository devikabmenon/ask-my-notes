# agent_langchain.py - The same agent using LangChain

from dotenv import load_dotenv
from langchain.agents import create_agent
from langchain_groq import ChatGroq

from tools import SYSTEM_PROMPT, search_notes, calculate, today, add_task

load_dotenv()

# Connect to the Groq model
llm = ChatGroq(
    model="openai/gpt-oss-120b",
    temperature=0
)

# Create the AI agent
agent = create_agent(
    model=llm,
    tools=[search_notes, calculate, today, add_task],
    system_prompt=SYSTEM_PROMPT,
)


# Ask the agent a question
def ask_agent(question):

    result = agent.invoke({
        "messages": [
            {"role": "user", "content": question}
        ]
    })

    messages = result["messages"]

    # Collect the names of tools used
    steps = [
        call["name"]
        for m in messages
        for call in getattr(m, "tool_calls", [])
    ]

    return messages[-1].content, steps


# Main program
if __name__ == "__main__":

    while True:

        question = input("\nYou: ")

        if question.lower() in ("quit", "exit"):
            break

        answer, steps = ask_agent(question)

        print("🛠 tools used:", steps or "none")
        print("Agent:", answer)