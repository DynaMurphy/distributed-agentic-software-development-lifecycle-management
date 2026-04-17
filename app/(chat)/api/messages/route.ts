import { auth } from "@/app/(auth)/auth";
import { getChatById, getMessagesByChatId } from "@/lib/db/queries";
import { convertToUIMessages } from "@/lib/utils";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const chatId = searchParams.get("chatId");
  if (!chatId) {
    return Response.json({ error: "chatId required" }, { status: 400 });
  }

  const chat = await getChatById({ id: chatId });
  if (!chat) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  if (chat.visibility === "private" && chat.userId !== session.user.id) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const messagesFromDb = await getMessagesByChatId({ id: chatId });
  const messages = convertToUIMessages(messagesFromDb);

  return Response.json({
    messages,
    visibility: chat.visibility,
    isReadonly: chat.userId !== session.user.id,
  });
}
