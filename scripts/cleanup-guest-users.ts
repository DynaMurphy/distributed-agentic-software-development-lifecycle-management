/**
 * Cleanup script to remove all guest users and their associated data.
 *
 * Guest users are identified by email matching the pattern `guest-{timestamp}`.
 * This script cascades deletes through: votes → messages → streams → chats → documents → suggestions → users
 *
 * Usage: npx tsx scripts/cleanup-guest-users.ts
 *        npx tsx scripts/cleanup-guest-users.ts --dry-run
 */
import { and, eq, inArray, like } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  chat,
  document,
  message,
  stream,
  suggestion,
  user,
  vote,
} from "../lib/db/schema";

const isDryRun = process.argv.includes("--dry-run");

async function main() {
  if (!process.env.POSTGRES_URL) {
    console.error("❌ POSTGRES_URL environment variable is not set.");
    process.exit(1);
  }

  const client = postgres(process.env.POSTGRES_URL);
  const db = drizzle(client);

  console.log(isDryRun ? "🔍 DRY RUN — no data will be deleted.\n" : "🗑️  LIVE RUN — data will be permanently deleted.\n");

  try {
    // 1. Find all guest users
    const guestUsers = await db
      .select({ id: user.id, email: user.email })
      .from(user)
      .where(and(like(user.email, "guest-%"), eq(user.systemUser, false)));

    console.log(`Found ${guestUsers.length} guest user(s).`);

    if (guestUsers.length === 0) {
      console.log("Nothing to clean up.");
      return;
    }

    const guestUserIds = guestUsers.map((u) => u.id);

    // 2. Find all chats belonging to guest users
    const guestChats = await db
      .select({ id: chat.id })
      .from(chat)
      .where(inArray(chat.userId, guestUserIds));

    const guestChatIds = guestChats.map((c) => c.id);
    console.log(`Found ${guestChats.length} chat(s) belonging to guest users.`);

    // 3. Find all documents belonging to guest users
    const guestDocuments = await db
      .select({ id: document.id, createdAt: document.createdAt })
      .from(document)
      .where(inArray(document.userId, guestUserIds));

    console.log(`Found ${guestDocuments.length} document(s) belonging to guest users.`);

    if (isDryRun) {
      console.log("\n📋 Summary (dry run):");
      console.log(`  - ${guestUsers.length} guest users would be deleted`);
      console.log(`  - ${guestChats.length} chats would be deleted`);
      console.log(`  - ${guestDocuments.length} documents would be deleted`);
      console.log(`  - Associated votes, messages, streams, and suggestions would also be deleted`);
      console.log("\nRun without --dry-run to execute the cleanup.");
      return;
    }

    // 4. Delete in correct order to respect foreign key constraints

    // 4a. Delete votes for guest chats
    if (guestChatIds.length > 0) {
      const deletedVotes = await db
        .delete(vote)
        .where(inArray(vote.chatId, guestChatIds))
        .returning();
      console.log(`  Deleted ${deletedVotes.length} vote(s).`);
    }

    // 4b. Delete messages for guest chats
    if (guestChatIds.length > 0) {
      const deletedMessages = await db
        .delete(message)
        .where(inArray(message.chatId, guestChatIds))
        .returning();
      console.log(`  Deleted ${deletedMessages.length} message(s).`);
    }

    // 4c. Delete streams for guest chats
    if (guestChatIds.length > 0) {
      const deletedStreams = await db
        .delete(stream)
        .where(inArray(stream.chatId, guestChatIds))
        .returning();
      console.log(`  Deleted ${deletedStreams.length} stream(s).`);
    }

    // 4d. Delete suggestions for guest documents
    if (guestDocuments.length > 0) {
      const docIds = guestDocuments.map((d) => d.id);
      const deletedSuggestions = await db
        .delete(suggestion)
        .where(inArray(suggestion.documentId, docIds))
        .returning();
      console.log(`  Deleted ${deletedSuggestions.length} suggestion(s).`);
    }

    // 4e. Delete documents belonging to guest users
    if (guestDocuments.length > 0) {
      const deletedDocuments = await db
        .delete(document)
        .where(inArray(document.userId, guestUserIds))
        .returning();
      console.log(`  Deleted ${deletedDocuments.length} document(s).`);
    }

    // 4f. Delete chats belonging to guest users
    if (guestChatIds.length > 0) {
      const deletedChats = await db
        .delete(chat)
        .where(inArray(chat.userId, guestUserIds))
        .returning();
      console.log(`  Deleted ${deletedChats.length} chat(s).`);
    }

    // 4g. Delete guest users
    const deletedUsers = await db
      .delete(user)
      .where(inArray(user.id, guestUserIds))
      .returning();
    console.log(`  Deleted ${deletedUsers.length} guest user(s).`);

    console.log("\n✅ Cleanup complete!");
  } catch (error) {
    console.error("❌ Error during cleanup:", error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
