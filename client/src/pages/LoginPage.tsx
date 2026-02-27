import { Building2, Shield, UserRound, Wrench } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { listContractorDemoAccounts, login, register } from "../lib/api";
import { ContractorDemoAccount, Role } from "../types";

export default function LoginPage() {
  const [role, setRole] = useState<Role>("citizen");
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [error, setError] = useState<string | null>(null);
  const [demoContractors, setDemoContractors] = useState<ContractorDemoAccount[]>([]);
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const isCitizenRegister = role === "citizen" && mode === "register";

  useEffect(() => {
    void (async () => {
      const data = await listContractorDemoAccounts();
      setDemoContractors(data);
    })();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);

    try {
      if (isCitizenRegister) {
        const response = await register(
          String(form.get("name")),
          String(form.get("email")),
          String(form.get("password"))
        );
        signIn(response.token, response.user);
      } else {
        const response = await login(String(form.get("email")), String(form.get("password")), role);
        signIn(response.token, response.user);
      }
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    }
  }

  return (
    <main className="mx-auto flex max-w-xl flex-col items-center px-6 py-14">
      <div className="mb-7 rounded-3xl bg-sky-100 p-4 text-nagar-blue">
        <Shield size={34} />
      </div>
      <h1 className="text-center text-5xl font-black text-nagar-ink">Sign in to NagarSeva</h1>
      <p className="mt-2 text-xl text-slate-500">Choose your role and sign in to continue</p>

      <div className="mt-8 grid w-full grid-cols-1 gap-2 rounded-2xl border border-slate-200 bg-slate-100 p-1.5 sm:grid-cols-3">
        <button
          onClick={() => {
            setRole("citizen");
            setError(null);
          }}
          className={`inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-lg ${
            role === "citizen" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
          }`}
          type="button"
        >
          <UserRound size={18} /> Citizen
        </button>
        <button
          onClick={() => {
            setRole("authority");
            setMode("signin");
            setError(null);
          }}
          className={`inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-lg ${
            role === "authority" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
          }`}
          type="button"
        >
          <Building2 size={18} /> Government Authority
        </button>
        <button
          onClick={() => {
            setRole("contractor");
            setMode("signin");
            setError(null);
          }}
          className={`inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-lg ${
            role === "contractor" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
          }`}
          type="button"
        >
          <Wrench size={18} /> Contractor
        </button>
      </div>

      <form onSubmit={handleSubmit} className="mt-8 w-full rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-3xl font-bold text-nagar-ink">
          {role === "citizen" ? "Citizen Login" : role === "authority" ? "Authority Login" : "Contractor Login"}
        </h2>
        <p className="mb-6 mt-1 text-lg text-slate-500">
          {role === "citizen"
            ? "Sign in to file complaints and track issues."
            : role === "authority"
              ? "Manage grievance workflow and closures."
              : "Take action on assigned complaints and submit closure proof."}
        </p>

        {isCitizenRegister ? (
          <Input name="name" label="Full Name" placeholder="Harsh Patel" />
        ) : null}

        <Input
          name="email"
          label="Email"
          placeholder={
            role === "authority"
              ? "admin@nagarseva.gov"
              : role === "contractor"
                ? "contractor@nagarseva.gov"
                : "citizen@nagarseva.com"
          }
          type="email"
        />
        <Input name="password" label="Password" placeholder="Enter password" type="password" />

        {error ? <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

        <button type="submit" className="mt-6 w-full rounded-xl bg-nagar-blue py-3 text-xl font-semibold text-white">
          {isCitizenRegister ? "Register" : "Sign In"}
        </button>

        {role === "citizen" ? (
          <p className="mt-5 text-center text-slate-500">
            {mode === "register" ? "Already have an account?" : "Don't have an account?"}{" "}
            <button
              type="button"
              className="font-semibold text-nagar-blue underline"
              onClick={() => setMode(mode === "register" ? "signin" : "register")}
            >
              {mode === "register" ? "Sign in" : "Register"}
            </button>
          </p>
        ) : null}
      </form>

      {role === "contractor" ? (
        <section className="mt-6 w-full rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-xl font-bold text-slate-900">Contractor Accounts</h3>
          <p className="mt-1 text-sm text-slate-500">Use these demo credentials. Complaint counts update from live assignments.</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[620px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-600">
                  <th className="px-2 py-2">ID</th>
                  <th className="px-2 py-2">Email</th>
                  <th className="px-2 py-2">Password</th>
                  <th className="px-2 py-2">Active</th>
                  <th className="px-2 py-2">Closed</th>
                </tr>
              </thead>
              <tbody>
                {demoContractors.map((item) => (
                  <tr key={item.id} className="border-b border-slate-100 text-slate-800">
                    <td className="px-2 py-2">{item.id}</td>
                    <td className="px-2 py-2">{item.email}</td>
                    <td className="px-2 py-2">{item.password}</td>
                    <td className="px-2 py-2">{item.active_complaints}</td>
                    <td className="px-2 py-2">{item.closed_complaints}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </main>
  );
}

function Input({
  name,
  label,
  placeholder,
  type = "text"
}: {
  name: string;
  label: string;
  placeholder: string;
  type?: string;
}) {
  return (
    <label className="mb-4 block">
      <span className="mb-2 block text-lg font-medium text-slate-800">{label}</span>
      <input
        name={name}
        required
        type={type}
        placeholder={placeholder}
        className="w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none transition focus:border-nagar-blue focus:ring-2 focus:ring-blue-100"
      />
    </label>
  );
}
