import { useEffect, useState } from "react";
import { api, apiLabel } from "./api.js";

const box = { fontFamily: "sans-serif", maxWidth: 600, margin: "40px auto", padding: 20 };

export default function App() {
  const [msg, setMsg] = useState(null);
  const [items, setItems] = useState([]);
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    try {
      setError("");
      const [message, itemList] = await Promise.all([
        api("/api/message/"),
        api("/api/items/"),
      ]);
      setMsg(message);
      setItems(itemList.items || []);
    } catch (e) {
      setMsg(null);
      setItems([]);
      setError("Cannot reach backend. Start Django on port 8000, then refresh. " + e.message);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const add = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      setError("");
      await api("/api/items/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      setName("");
      await load();
    } catch (e) {
      setError("Could not add item: " + e.message);
    }
  };

  return (
    <div style={box}>
      <h1>React + Django</h1>
      <p>This page is calling <b>{apiLabel}</b></p>
      {error && <p style={{ color: "red" }}>{error}</p>}
      {msg && (
        <p>
          <b>{msg.message}</b>
          <br />
          host: {msg.hostname} | time: {msg.time}
        </p>
      )}
      <h2>Items</h2>
      <ul>
        {items.map((item) => (
          <li key={item.id}>{item.name}</li>
        ))}
      </ul>
      <form onSubmit={add}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New item"
        />
        <button type="submit">Add</button>
      </form>
      <button onClick={load} style={{ marginTop: 10 }}>
        Refresh
      </button>
    </div>
  );
}
