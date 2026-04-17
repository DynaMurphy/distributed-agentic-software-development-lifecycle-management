import type {
  CreateDocumentCallbackProps,
  DocumentHandler,
  UpdateDocumentCallbackProps,
} from "@/lib/artifacts/server";
import { listMilestones, getMilestoneById, getMilestoneItems } from "@/lib/db/bitemporal-work-items";

/**
 * Server handler for the "milestone" artifact kind.
 *
 * The milestone artifact is a management view for release milestones.
 * Fetches milestone data with progress info and streams it to the client.
 */
export const milestoneDocumentHandler: DocumentHandler<"milestone"> = {
  kind: "milestone",

  onCreateDocument: async ({
    id,
    title,
    dataStream,
  }: CreateDocumentCallbackProps) => {
    // If opened with a specific milestone ID, fetch that milestone
    if (id && id !== "milestones-view" && id.match(/^[0-9a-f-]{36}$/)) {
      const milestone = await getMilestoneById(id);
      const items = milestone ? await getMilestoneItems(id) : [];
      const content = JSON.stringify({ milestone, items });

      dataStream.write({
        type: "data-milestoneDelta",
        data: content,
        transient: true,
      });
      return;
    }

    // Otherwise, fetch all milestones for the list/board view
    const milestones = await listMilestones({});
    const content = JSON.stringify(milestones);

    dataStream.write({
      type: "data-milestoneDelta",
      data: content,
      transient: true,
    });
  },

  onUpdateDocument: async ({
    document,
    description,
    dataStream,
  }: UpdateDocumentCallbackProps) => {
    // Refresh milestone data
    const milestones = await listMilestones({});
    const content = JSON.stringify(milestones);

    dataStream.write({
      type: "data-milestoneDelta",
      data: content,
      transient: true,
    });
  },
};
