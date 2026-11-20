import { useState } from "react";
import "./App.css";

const API = "http://localhost:8000";

// Display PDF source names and page numbers
function showSources(sources) {
  const names = sources.map(
    (s) => `${s.source} p.${s.page}`
  );

  return [...new Set(names)].join(" · ");
}

function App() {

  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);

  // Add a message to chat
  function addMessage(msg) {
    setMessages((old) => [...old, msg]);
  }

  // Ask a question
  async function askQuestion() {

    if (!question.trim() || loading) return;

    const myQuestion = question;

    addMessage({
      role: "user",
      text: myQuestion
    });

    setQuestion("");
    setLoading(true);

    try {

      const res = await fetch(`${API}/ask`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          question: myQuestion
        })
      });

      if (!res.ok) {
        throw new Error("Server error");
      }

      const data = await res.json();

      addMessage({
        role: "bot",
        text: data.answer,
        sources: data.sources
      });

    } catch (error) {

      addMessage({
        role: "bot",
        text: "Oops! Is the backend running?"
      });

    }

    setLoading(false);
  }

  // Upload PDF
  async function uploadPdf(e) {

    const file = e.target.files[0];

    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      addMessage({
        role: "bot",
        text: "Please select a PDF file."
      });
      return;
    }

    const form = new FormData();
    form.append("file", file);

    setLoading(true);

    try {

      const res = await fetch(`${API}/upload`, {
        method: "POST",
        body: form
      });

      if (!res.ok) {
        throw new Error("Upload failed");
      }

      const data = await res.json();

      addMessage({
        role: "bot",
        text: data.message
      });

    } catch (error) {

      addMessage({
        role: "bot",
        text: "Upload failed. Please try again."
      });

    }

    setLoading(false);
    e.target.value = "";
  }

  // Display the application
  return (

    <div className="app">

      <h1>📚 Ask My Notes</h1>

      <div className="chat">

        {messages.length === 0 && (
          <p className="hint">
            Ask anything about your notes 👇
          </p>
        )}

        {messages.map((m, i) => (

          <div key={i} className={`msg ${m.role}`}>

            <p>{m.text}</p>

            {m.sources && (
              <small>
                📄 {showSources(m.sources)}
              </small>
            )}

          </div>

        ))}

        {loading && (
          <div className="msg bot">
            Thinking… 🤔
          </div>
        )}

      </div>

      <div className="ask-box">

        <label className="upload">
          📎 PDF

          <input
            type="file"
            accept=".pdf,application/pdf"
            hidden
            onChange={uploadPdf}
            disabled={loading}
          />
        </label>

        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) =>
            e.key === "Enter" && askQuestion()
          }
          placeholder="Type your question..."
          disabled={loading}
        />

        <button
          onClick={askQuestion}
          disabled={loading}
        >
          Ask
        </button>

      </div>

    </div>

  );
}

export default App;