export default function Home() {
  return (
    <main style={{maxWidth: 760, margin: "4rem auto", padding: "0 1rem", lineHeight: 1.6}}>
      <h1 style={{fontSize: "2.5rem", marginBottom: "0.5rem"}}>Spark</h1>
      <p style={{fontSize: "1.25rem", color: "#666", marginBottom: "2rem"}}>
        AI-native workspace that plans, edits, tests, and ships code — with guardrails.
      </p>
      <form method="post" action="/api/subscribe" style={{marginTop: "2rem", display: "flex", gap: "0.5rem"}}>
        <input 
          name="email" 
          type="email" 
          placeholder="you@domain.com" 
          required 
          style={{
            flex: 1, 
            padding: "0.75rem", 
            border: "1px solid #ddd", 
            borderRadius: "4px",
            fontSize: "1rem"
          }}
        />
        <button 
          type="submit"
          style={{
            padding: "0.75rem 1.5rem",
            background: "#0070f3",
            color: "white",
            border: "none",
            borderRadius: "4px",
            fontSize: "1rem",
            cursor: "pointer"
          }}
        >
          Request access
        </button>
      </form>
      <p style={{marginTop: "2rem", color: "#666"}}>
        <a href="https://github.com/PlangoDev/Spark" style={{color: "#0070f3", textDecoration: "none"}}>GitHub</a>
        {" • "}
        <a href="/privacy" style={{color: "#0070f3", textDecoration: "none"}}>Privacy</a>
      </p>
      <div style={{marginTop: "3rem", padding: "1rem", background: "#f5f5f5", borderRadius: "4px", fontSize: "0.9rem"}}>
        <strong>Local-first by default.</strong> Your code stays on your machine unless you opt in to cloud features.
      </div>
    </main>
  );
}
