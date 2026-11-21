# agent_graph.py - Build the agent using LangGraph

from dotenv import load_dotenv
from langchain_groq import ChatGroq
from langchain_core.messages import SystemMessage

from langgraph.graph import StateGraph, MessagesState, START
from langgraph.prebuilt import ToolNode, tools_condition
from langgraph.checkpoint.memory import InMemorySaver

from tools import SYSTEM_PROMPT, search_notes, calculate, today, add_task

load_dotenv()

# Available tools
tools = [search_notes, calculate, today, add_task]

# Connect the AI model with the tools
llm = ChatGroq(
    model="openai/gpt-oss-120b",
    temperature=0
).bind_tools(tools)


# THINK node
def think(state: MessagesState):

    reply = llm.invoke(
        [SystemMessage(SYSTEM_PROMPT)] + state["messages"]
    )

    return {"messages": [reply]}


# Create the graph
graph = StateGraph(MessagesState)

# Add nodes
graph.add_node("think", think)
graph.add_node("tools", ToolNode(tools))

# Connect nodes
graph.add_edge(START, "think")

graph.add_conditional_edges(
    "think",
    tools_condition
)

graph.add_edge("tools", "think")

# Compile graph with memory
study_graph = graph.compile(
    checkpointer=InMemorySaver()
)


# Main program
if __name__ == "__main__":

    chat = {
        "configurable": {
            "thread_id": "student-1"
        }
    }

    while True:

        question = input("\nYou: ")

        if question.lower() in ("quit", "exit"):
            break

        user_msg = {
            "messages": [
                {"role": "user", "content": question}
            ]
        }

        for event in study_graph.stream(
            user_msg,
            chat,
            stream_mode="updates"
        ):
            print(event)