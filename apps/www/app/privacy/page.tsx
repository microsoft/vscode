export default function Privacy() {
  return (
    <main style={{maxWidth: 760, margin: "4rem auto", padding: "0 1rem", lineHeight: 1.6}}>
      <h1 style={{fontSize: "2.5rem", marginBottom: "1rem"}}>Privacy</h1>
      <p style={{marginBottom: "1rem"}}>
        Spark is <strong>local-first by default</strong>. Your code, files, and project data never leave your machine unless you explicitly opt in to cloud features.
      </p>
      
      <h2 style={{fontSize: "1.5rem", marginTop: "2rem", marginBottom: "0.5rem"}}>What stays local</h2>
      <ul style={{marginLeft: "1.5rem"}}>
        <li>All source code and files</li>
        <li>Git history and diffs</li>
        <li>Test results</li>
        <li>File system access logs</li>
      </ul>
      
      <h2 style={{fontSize: "1.5rem", marginTop: "2rem", marginBottom: "0.5rem"}}>What requires opt-in</h2>
      <ul style={{marginLeft: "1.5rem"}}>
        <li>Cloud model API calls (OpenAI, Anthropic, etc.)</li>
        <li>Anonymized usage telemetry</li>
        <li>Cloud project sync</li>
      </ul>
      
      <h2 style={{fontSize: "1.5rem", marginTop: "2rem", marginBottom: "0.5rem"}}>What we never collect</h2>
      <ul style={{marginLeft: "1.5rem"}}>
        <li>Secrets, API keys, or environment variables</li>
        <li>Repository contents without explicit opt-in</li>
        <li>Personally identifiable information (PII) without consent</li>
      </ul>
      
      <p style={{marginTop: "2rem"}}>
        <a href="/" style={{color: "#0070f3", textDecoration: "none"}}>← Back to home</a>
      </p>
    </main>
  );
}
