import { describe, expect, it } from "vitest";

import {
  timedCaptureEvidence,
  type TimedCaptureRow,
} from "../../../tests/fixtures/analysisView.js";
import {
  BOOKMARK_TOGGLE_ROWS,
  CREATES_BY_TITLE_ROWS,
  ITEM_REFERENCES_ROWS,
  feedEntry,
} from "../../../tests/fixtures/environmentStateItemWrites.js";
import { environmentStateViewOf } from "../../../tests/fixtures/environmentStateWrites.js";

const planOf = (rows: readonly TimedCaptureRow[], tool: string) => {
  const plan = environmentStateViewOf(timedCaptureEvidence(rows)).writes.find(
    (candidate) => candidate.tool === tool,
  );
  if (plan === undefined) throw new Error(`No plan for ${tool}`);
  return plan;
};

describe("item writes", () => {
  it("learns a create's sort from a later list its full order follows, after one create was placed last", () => {
    expect(planOf(CREATES_BY_TITLE_ROWS, "post_folders")).toMatchObject({
      served: true,
      insert: { rule: "sorted", field: "title", direction: "ascending" },
    });
    expect(planOf(CREATES_BY_TITLE_ROWS, "delete_folders_by_id")).toMatchObject(
      { served: true },
    );
  });

  it("serves a create whose parent and tags a call names by id, one call naming none", () => {
    const plan = planOf(ITEM_REFERENCES_ROWS, "post_items");
    expect(plan).toMatchObject({ served: true });
    expect(plan.rules).toContainEqual(
      expect.objectContaining({
        field: "parent",
        rule: "reference",
        member: "parentId",
        type: "/api/locations",
      }),
    );
    expect(plan.rules).toContainEqual(
      expect.objectContaining({
        field: "tags",
        rule: "reference",
        member: "tagIds",
        type: "/api/tags",
        many: true,
      }),
    );
  });

  it("serves a body-less action that calls show flipping its flag both ways", () => {
    expect(
      planOf(BOOKMARK_TOGGLE_ROWS, "put_entries_bookmark_by_id"),
    ).toMatchObject({
      served: true,
      address: { by: "action", segment: "bookmark" },
      rules: expect.arrayContaining([{ field: "starred", rule: "toggle" }]),
    });
  });

  it("serves no action whose calls flipped its flag one way only", () => {
    const starred = feedEntry(1, true, "2026-10-17T18:00:03.120000Z");
    expect(
      planOf(
        [
          ...BOOKMARK_TOGGLE_ROWS.slice(0, 4),
          ["GET", "/api/entries/1", starred],
        ],
        "put_entries_bookmark_by_id",
      ),
    ).toMatchObject({ served: false });
  });

  it("serves no toggle a call left its flag unchanged under", () => {
    const unchanged = feedEntry(1, false, "2026-10-17T18:00:08.050000Z");
    expect(
      planOf(
        [
          ...BOOKMARK_TOGGLE_ROWS,
          ["PUT", "/api/entries/1/bookmark", "", 204],
          ["GET", "/api/entries/1", unchanged],
        ],
        "put_entries_bookmark_by_id",
      ),
    ).toMatchObject({ served: false });
  });
});
