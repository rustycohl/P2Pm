import { runSelfTest } from "./self-test.mjs";

const button = document.querySelector("#run");
const result = document.querySelector("#result");

async function run() {
  button.disabled = true;
  result.dataset.state = "running";
  result.textContent = "RUNNING INDEPENDENT BROWSER SELF-TEST…";
  try {
    const report = await runSelfTest();
    result.dataset.state = report.pass ? "pass" : "fail";
    result.textContent = [
      report.pass ? "PORT PASS" : "PORT FAIL",
      report.summary,
      "",
      ...report.checks.map((check) => `${check.pass ? "✓" : "✕"} ${check.name}`),
      "",
      JSON.stringify(report.evidence, null, 2),
    ].join("\n");
  } catch (error) {
    result.dataset.state = "fail";
    result.textContent = `PORT ERROR\n${error.message}`;
  } finally {
    button.disabled = false;
  }
}

button.addEventListener("click", run);
run();
