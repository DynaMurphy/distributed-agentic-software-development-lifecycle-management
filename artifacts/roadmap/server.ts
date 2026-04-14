import type {
  CreateDocumentCallbackProps,
  DocumentHandler,
  UpdateDocumentCallbackProps,
} from "@/lib/artifacts/server";
import { getRoadmapItems } from "@/lib/db/bitemporal-work-items";

/**
 * Server handler for the "roadmap" artifact kind.
 *
 * The roadmap artifact is a read-oriented visualization view.
 * Fetches feature data with timeline/horizon info and streams it to the client.
 */
export const roadmapDocumentHandler: DocumentHandler<"roadmap"> = {
  kind: "roadmap",

  onCreateDocument: async ({
    id,
    title,
    dataStream,
  }: CreateDocumentCallbackProps) => {
    const items = await getRoadmapItems({});
    const content = JSON.stringify(items);

    dataStream.write({
      type: "data-roadmapDelta",
      data: content,
      transient: true,
    });
  },

  onUpdateDocument: async ({
    document,
    description,
    dataStream,
  }: UpdateDocumentCallbackProps) => {
    // Refresh roadmap data on update
    const items = await getRoadmapItems({});
    const content = JSON.stringify(items);

    dataStream.write({
      type: "data-roadmapDelta",
      data: content,
      transient: true,
    });
  },
};
