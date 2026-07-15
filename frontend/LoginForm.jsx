import { useState } from "react";
import { loginUser, saveToken } from "./api";

export default function LoginForm({ onLogin}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  
  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setMsg("");

    try {
      const data = await loginUser({ email, password }); // { access_token, token_type }
      saveToken(data.access_token); // salvăm token-ul în localStorage
      setMsg("Logged in!");
      setEmail("");
      setPassword("");
      if (onLogin) onLogin();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div style={{ border: "1px solid #444", padding: 16, borderRadius: 8 }}>
      <h2>Login</h2>

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 8 }}>
        <input
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button type="submit">Login</button>
      </form>

      {msg && <p style={{ color: "lightgreen" }}>{msg}</p>}
      {error && <p style={{ color: "salmon" }}>{error}</p>}
    </div>
  );
}
