import { pbkdf2Sync, randomBytes } from "node:crypto";

function readSecret(label) {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function") {
    return new Promise((resolve) => {
      let value = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (chunk) => { value += chunk; });
      process.stdin.on("end", () => resolve(value.trim()));
    });
  }
  return new Promise((resolve, reject) => {
    let value = "";
    process.stdout.write(label);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    function finish(error) {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener("data", onData);
      process.stdout.write("\n");
      if (error) reject(error); else resolve(value);
    }
    function onData(chunk) {
      for (const character of chunk) {
        if (character === "\u0003") return finish(new Error("cancelled"));
        if (character === "\r" || character === "\n") return finish();
        if (character === "\u007f" || character === "\b") value = value.slice(0, -1);
        else value += character;
      }
    }
    process.stdin.on("data", onData);
  });
}

try {
  const password = await readSecret("New simulated root passphrase: ");
  if (password.length < 16) throw new Error("use at least 16 characters");
  if (process.stdin.isTTY) {
    const confirmation = await readSecret("Confirm passphrase: ");
    if (confirmation !== password) throw new Error("passphrases do not match");
  }
  const iterations = 310000;
  const salt = randomBytes(16);
  const verifier = pbkdf2Sync(password, salt, iterations, 32, "sha256");
  process.stdout.write(JSON.stringify({
    enabled: true,
    auth: {
      kdf: "PBKDF2-SHA-256",
      iterations,
      salt: salt.toString("hex"),
      verifier: verifier.toString("hex")
    }
  }, null, 2) + "\n");
} catch (error) {
  process.stderr.write("admin verifier not generated: " + error.message + "\n");
  process.exitCode = 1;
}
