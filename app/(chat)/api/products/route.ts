import { auth } from "@/app/(auth)/auth";
import { guestWriteGuard } from "@/lib/auth-guard";
import { listProducts, getProductById, updateProduct } from "@/lib/db/bitemporal-work-items";
import { ChatSDKError } from "@/lib/errors";

/**
 * GET /api/products
 *   - No id: list products (supports ?status= filter)
 *   - With id: get product detail
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    const status = searchParams.get("status") as any;
    const products = await listProducts({ status: status || undefined });
    return Response.json(products, { status: 200 });
  }

  const product = await getProductById(id);
  if (!product) {
    return Response.json({ error: "Product not found" }, { status: 404 });
  }

  return Response.json(product, { status: 200 });
}

/**
 * PATCH /api/products?id=<uuid>
 *   Update a product's fields.
 */
export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }
  const guestError = guestWriteGuard(session, "feature");
  if (guestError) return guestError;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return Response.json({ error: "Product ID is required" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const versionId = await updateProduct({
      id,
      name: body.name,
      description: body.description,
      status: body.status,
      settings: body.settings,
      maintainedBy: session.user.id,
    });

    return Response.json({ id, versionId }, { status: 200 });
  } catch (error) {
    return Response.json({ error: "Failed to update product" }, { status: 400 });
  }
}
