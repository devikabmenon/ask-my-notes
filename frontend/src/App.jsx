
import { useState } from "react";
import "./App.css";

const API = "http://localhost:8000";

function showSources(sources) {
  if (!sources) return "";
  return [...new Set(sources.map((s) => `${s.source || "PDF"} p.${s.page ?? "?"}`))].join(" · ");
}

function App() {
  const [page, setPage] = useState("chat");
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);

  const [topic, setTopic] = useState("");
  const [numQuestions, setNumQuestions] = useState(5);
  const [quiz, setQuiz] = useState([]);
  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizError, setQuizError] = useState("");

  function addMessage(msg) {
    setMessages((old) => [...old, msg]);
  }

  async function askQuestion() {
    if (!question.trim() || loading) return;

    const myQuestion = question;

    addMessage({ role: "user", text: myQuestion });
    setQuestion("");
    setLoading(true);

    try {
      const res = await fetch(`${API}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: myQuestion })
      });

      if (!res.ok) throw new Error("Server error");

      const data = await res.json();

      addMessage({
        role: "bot",
        text: data.answer,
        sources: data.sources
      });
    } catch {
      addMessage({
        role: "bot",
        text: "Oops! Is the backend running?"
      });
    }

    setLoading(false);
  }

  async function uploadPdf(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      addMessage({ role: "bot", text: "Please select a PDF file." });
      e.target.value = "";
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

      if (!res.ok) throw new Error("Upload failed");

      const data = await res.json();
      addMessage({ role: "bot", text: data.message });
    } catch {
      addMessage({ role: "bot", text: "Upload failed. Please try again." });
    }

    setLoading(false);
    e.target.value = "";
  }

  async function generateQuiz() {
    if (quizLoading || loading) return;

    setQuizLoading(true);
    setQuizError("");
    setQuiz([]);
    setSelectedAnswers({});
    setSubmitted(false);

    try {
      const res = await fetch(`${API}/generate-quiz`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: topic.trim() || "important concepts from my notes",
          num_questions: Number(numQuestions)
        })
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.detail || "Quiz generation failed.");

      setQuiz(data.quiz);
    } catch (error) {
      setQuizError(error.message || "Unable to generate quiz.");
    }

    setQuizLoading(false);
  }

  function selectAnswer(index, option) {
    if (submitted) return;

    setSelectedAnswers((old) => ({
      ...old,
      [index]: option
    }));
  }

  function calculateScore() {
    return quiz.reduce(
      (score, q, index) => score + (selectedAnswers[index] === q.answer ? 1 : 0),
      0
    );
  }

  function submitQuiz() {
    if (Object.keys(selectedAnswers).length !== quiz.length) {
      setQuizError("Please answer all questions before submitting.");
      return;
    }

    setQuizError("");
    setSubmitted(true);
  }

  function retryQuiz() {
    setQuiz([]);
    setSelectedAnswers({});
    setSubmitted(false);
    setQuizError("");
  }

  return (
    <div className="layout">

      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">✦</div>
          <div>
            <h2>NoteMind</h2>
            <span>AI STUDY SPACE</span>
          </div>
        </div>

        <div className="nav-label">WORKSPACE</div>

        <button
          className={`nav-item ${page === "chat" ? "active" : ""}`}
          onClick={() => setPage("chat")}
        >
          <span className="nav-icon">◉</span>
          Ask My Notes
        </button>

        <button
          className={`nav-item ${page === "quiz" ? "active" : ""}`}
          onClick={() => setPage("quiz")}
        >
          <span className="nav-icon">▤</span>
          AI Quiz
        </button>

        <div className="sidebar-bottom">
          <div className="sidebar-card">
            <div className="sidebar-card-icon">✧</div>
            <h4>Study smarter</h4>
            <p>Ask questions and turn your notes into practice quizzes.</p>
          </div>

          <div className="profile">
            <div className="profile-avatar">S</div>
            <div>
              <strong>Student Workspace</strong>
              <small>Personal study space</small>
            </div>
          </div>
        </div>
      </aside>

      {/* MAIN AREA */}
      <main className="main">

        {/* TOP BAR */}
        <header className="topbar">
          <div>
            <span className="topbar-label">YOUR LEARNING SPACE</span>
            <h3>{page === "chat" ? "Ask My Notes" : "AI Quiz Generator"}</h3>
          </div>

          <div className="topbar-badge">
            <span className="status-dot"></span>
            AI POWERED
          </div>
        </header>

        {/* CHAT PAGE */}
        {page === "chat" && (
          <section className="chat-page">

            <div className="chat-area">

              {messages.length === 0 && (
                <div className="welcome">
                  <div className="welcome-icon">✦</div>
                  <span className="eyebrow">YOUR AI STUDY ASSISTANT</span>
                  <h1>Let's make learning<br />a little <span>easier.</span></h1>
                  <p>
                    Ask questions from your notes, understand difficult
                    concepts and learn at your own pace.
                  </p>

                  <div className="suggestions">
                    <button onClick={() => setQuestion("Summarize my notes")}>
                      <span>✧</span> Summarize my notes
                    </button>
                    <button onClick={() => setQuestion("Explain the important concepts")}>
                      <span>↗</span> Explain important concepts
                    </button>
                    <button onClick={() => setPage("quiz")}>
                      <span>▤</span> Practice with a quiz
                    </button>
                  </div>
                </div>
              )}

              {messages.map((m, i) => (
                <div key={i} className={`message-row ${m.role}`}>
                  {m.role === "bot" && <div className="bot-avatar">✦</div>}

                  <div className={`message ${m.role}`}>
                    <p>{m.text}</p>

                    {m.sources && (
                      <small className="sources">
                        📄 {showSources(m.sources)}
                      </small>
                    )}
                  </div>
                </div>
              ))}

              {loading && (
                <div className="message-row bot">
                  <div className="bot-avatar">✦</div>
                  <div className="message bot loading-text">
                    Thinking about your notes...
                  </div>
                </div>
              )}
            </div>

            <div className="chat-footer">
              <div className="chat-input-wrap">

                <label className="upload-button" title="Upload PDF">
                  ＋
                  <input
                    type="file"
                    accept=".pdf,application/pdf"
                    hidden
                    onChange={uploadPdf}
                    disabled={loading}
                  />
                </label>

                <input
                  className="chat-input"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && askQuestion()}
                  placeholder="Ask something about your notes..."
                  disabled={loading}
                />

                <button
                  className="send-button"
                  onClick={askQuestion}
                  disabled={loading || !question.trim()}
                >
                  ↑
                </button>
              </div>

              <p className="footer-note">
                Upload your PDF using + · AI answers are based on your notes
              </p>
            </div>

          </section>
        )}

        {/* QUIZ PAGE */}
        {page === "quiz" && (
          <section className="quiz-page">

            {!quiz.length && (
              <div className="quiz-hero">
                <div className="quiz-hero-icon">▤</div>
                <span className="eyebrow">ACTIVE RECALL · AI GENERATED</span>
                <h1>Challenge your<br /><span>understanding.</span></h1>
                <p>
                  Turn your study notes into a personalized quiz.
                  Practice, check your knowledge and learn from mistakes.
                </p>

                <div className="quiz-form">

                  <label>WHAT DO YOU WANT TO PRACTICE?</label>
                  <input
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="e.g. Machine Learning, CNN, Python"
                    disabled={quizLoading}
                  />

                  <label>NUMBER OF QUESTIONS</label>
                  <div className="question-count">
                    {[3, 5, 7, 10].map((n) => (
                      <button
                        key={n}
                        className={numQuestions === n ? "count-active" : ""}
                        onClick={() => setNumQuestions(n)}
                        disabled={quizLoading}
                      >
                        {n}
                      </button>
                    ))}
                  </div>

                  <button
                    className="generate-button"
                    onClick={generateQuiz}
                    disabled={quizLoading || loading}
                  >
                    {quizLoading ? "✦ Generating your quiz..." : "✦ Generate my quiz"}
                  </button>

                  {quizError && <div className="quiz-error">{quizError}</div>}

                  <div className="quiz-tip">
                    ✧ Questions are generated using the content in your uploaded notes.
                  </div>
                </div>
              </div>
            )}

            {quiz.length > 0 && (
              <div className="quiz-content">

                <div className="quiz-top">
                  <button className="back-button" onClick={retryQuiz}>
                    ← New quiz
                  </button>
                  <span>{quiz.length} QUESTIONS</span>
                </div>

                <div className="quiz-heading">
                  <span className="eyebrow">YOUR PRACTICE SESSION</span>
                  <h1>{topic || "Important concepts"}</h1>
                  <p>Select the best answer for each question.</p>
                </div>

                {quiz.map((q, index) => (
                  <div className="question-card" key={index}>

                    <div className="question-meta">
                      <span>QUESTION {String(index + 1).padStart(2, "0")}</span>
                      <span>{index + 1} / {quiz.length}</span>
                    </div>

                    <h3>{q.question}</h3>

                    <div className="options-grid">
                      {q.options.map((option, optionIndex) => {
                        const isSelected = selectedAnswers[index] === option;
                        const isCorrect = submitted && option === q.answer;
                        const isWrong = submitted && isSelected && option !== q.answer;

                        return (
                          <button
                            key={optionIndex}
                            className={`option ${isSelected ? "selected" : ""} ${isCorrect ? "correct" : ""} ${isWrong ? "wrong" : ""}`}
                            onClick={() => selectAnswer(index, option)}
                            disabled={submitted}
                          >
                            <span className="option-letter">
                              {String.fromCharCode(65 + optionIndex)}
                            </span>
                            <span className="option-text">{option}</span>
                            {isCorrect && <span className="option-status">✓</span>}
                            {isWrong && <span className="option-status">✕</span>}
                          </button>
                        );
                      })}
                    </div>

                    {submitted && (
                      <div className="explanation">
                        <strong>{selectedAnswers[index] === q.answer ? "✓ Correct!" : "✦ Review this answer"}</strong>
                        <p><b>Answer:</b> {q.answer}</p>
                        <p>{q.explanation}</p>
                      </div>
                    )}

                  </div>
                ))}

                {quizError && <div className="quiz-error">{quizError}</div>}

                {!submitted && (
                  <button className="submit-button" onClick={submitQuiz}>
                    Submit answers →
                  </button>
                )}

                {submitted && (
                  <div className="score-card">
                    <div className="score-icon">✦</div>
                    <span className="eyebrow">QUIZ COMPLETED</span>
                    <h2>{calculateScore()} <span>/ {quiz.length}</span></h2>
                    <p>
                      {calculateScore() === quiz.length
                        ? "Perfect score! You have mastered this quiz."
                        : "Nice effort! Review the explanations and keep learning."}
                    </p>

                    <div className="score-bar">
                      <div
                        className="score-fill"
                        style={{ width: `${(calculateScore() / quiz.length) * 100}%` }}
                      ></div>
                    </div>

                    <button className="generate-button" onClick={retryQuiz}>
                      Create another quiz →
                    </button>
                  </div>
                )}

              </div>
            )}

          </section>
        )}

      </main>
    </div>
  );
}

export default App;
