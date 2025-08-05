// pages/onboard.js
import { useSession, signIn } from "next-auth/react";
import { useState }        from "react";
import { useRouter }       from "next/router";

export default function Onboard() {
  const { data: session } = useSession();
  const [region, setRegion] = useState("");
  const router = useRouter();

  if (!session) {
    return (
      <div style={{ padding: "2rem" }}>
        <p>Please sign in first:</p>
        <button onClick={() => signIn()}>Sign in</button>
      </div>
    );
  }

  const handleSubmit = async () => {
    await fetch("/api/set-region", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ region }),
    });
    router.push("/");
  };

  return (
    <div style={{ padding: "2rem" }}>
      <h1>Welcome, {session.user.email}</h1>
      <p>Select your teaching region:</p>
      <select
        value={region}
        onChange={(e) => setRegion(e.target.value)}
        style={{ padding: ".5rem", fontSize: "1rem" }}
      >
        <option value="">— Choose region —</option>
        <option value="nys">New York State</option>
        <option value="england">England (KS1–4)</option>
        <option value="common_core">Common Core</option>
        <option value="none">None / General</option>
      </select>
      <div style={{ marginTop: "1rem" }}>
        <button
          onClick={handleSubmit}
          disabled={!region}
          style={{ padding: ".6rem 1.2rem", fontSize: "1rem" }}
        >
          Continue
        </button>
      </div>
    </div>
  );
}
