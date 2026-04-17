import postgres from "postgres";
import { config } from "dotenv";
config({ path: ".env.local" });
const client = postgres(process.env.POSTGRES_URL!);
async function main() {
  const milestones = await client`SELECT id, title, repository_id FROM current_milestones WHERE valid_to = 'infinity' ORDER BY title`;
  console.log("Milestones:");
  for (const m of milestones) console.log(`  ${m.title} | repo: ${m.repository_id}`);
  const repos = await client`SELECT id, name FROM repositories WHERE valid_to = 'infinity' ORDER BY name`;
  console.log("\nRepositories:");
  for (const r of repos) console.log(`  ${r.name} | id: ${r.id}`);
  await client.end();
}
main();
