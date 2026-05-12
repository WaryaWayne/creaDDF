import { assert, describe, it } from "@effect/vitest";
import { Effect, Exit } from "effect";
import {
  DdfDbClientValidationError,
  coListAgentKeysFromRaw,
  coListOfficeKeysFromRaw,
  groupRowsBy,
  memberDesignationRowsFromRaw,
  memberLanguageRowsFromRaw,
  projectionPlan,
  propertyFieldPresets,
  socialRowsFromRaw,
  validateListOptions,
} from "./client";

describe("database read client helpers", () => {
  it("keeps website field presets free of raw payloads by default", () => {
    assert.deepEqual(propertyFieldPresets.card, [
      "listingKey",
      "listPrice",
      "city",
      "province",
      "propertyType",
      "propertySubType",
      "bedroomsTotal",
      "bathroomsTotalInteger",
      "modificationTimestamp",
    ]);
    assert.equal(propertyFieldPresets.card.join(",").includes("raw"), false);
  });

  it("only includes raw when explicitly requested", () => {
    const defaultPlan = projectionPlan<"listingKey" | "raw">(["listingKey", "raw"], {
      select: ["listingKey", "raw"],
    });
    const rawPlan = projectionPlan<"listingKey" | "raw">(["listingKey"], {
      includeRaw: true,
    });

    assert.deepEqual(defaultPlan.fields, ["listingKey"]);
    assert.equal(defaultPlan.includesRaw, false);
    assert.deepEqual(rawPlan.fields, ["listingKey", "raw"]);
    assert.equal(rawPlan.includesRaw, true);
  });

  it("groups related rows by parent key for batched include assembly", () => {
    const grouped = groupRowsBy(
      [
        { listingKey: "listing-1", mediaKey: "media-1" },
        { listingKey: "listing-1", mediaKey: "media-2" },
        { listingKey: "listing-2", mediaKey: "media-3" },
        { listingKey: null, mediaKey: "ignored" },
      ],
      "listingKey",
    );

    assert.deepEqual(grouped.get("listing-1"), [
      { listingKey: "listing-1", mediaKey: "media-1" },
      { listingKey: "listing-1", mediaKey: "media-2" },
    ]);
    assert.deepEqual(grouped.get("listing-2"), [
      { listingKey: "listing-2", mediaKey: "media-3" },
    ]);
    assert.equal(grouped.has("ignored"), false);
  });

  it("parses member embedded include rows from the raw payload", () => {
    const raw = {
      MemberSocialMedia: [
        {
          SocialMediaKey: "social-1",
          SocialMediaType: "Website",
          SocialMediaUrlOrId: "https://agent.example",
        },
      ],
      MemberLanguages: ["English", "French"],
      MemberDesignation: ["Broker"],
    };

    assert.deepEqual(socialRowsFromRaw("Member", "member-1", raw), [
      {
        socialMediaKey: "social-1",
        resource: "Member",
        resourceKey: "member-1",
        socialMediaType: "Website",
        socialMediaUrlOrId: "https://agent.example",
        modificationTimestamp: null,
        raw: raw.MemberSocialMedia[0],
      },
    ]);
    assert.deepEqual(memberLanguageRowsFromRaw("member-1", raw), [
      { memberKey: "member-1", language: "English" },
      { memberKey: "member-1", language: "French" },
    ]);
    assert.deepEqual(memberDesignationRowsFromRaw("member-1", raw), [
      { memberKey: "member-1", designation: "Broker" },
    ]);
  });

  it("parses office social media and property co-list keys from raw payloads", () => {
    const officeRaw = {
      OfficeSocialMedia: [
        {
          SocialMediaKey: "office-social-1",
          SocialMediaType: "Facebook",
          SocialMediaUrlOrId: "office-page",
        },
      ],
    };
    const propertyRaw = {
      CoListAgentKey: "agent-2",
      CoListAgentKey2: "agent-3",
      CoListAgentKey3: "agent-2",
      CoListOfficeKey: "office-2",
      CoListOfficeKey2: "office-3",
      CoListOfficeKey3: null,
    };

    assert.deepEqual(socialRowsFromRaw("Office", "office-1", officeRaw), [
      {
        socialMediaKey: "office-social-1",
        resource: "Office",
        resourceKey: "office-1",
        socialMediaType: "Facebook",
        socialMediaUrlOrId: "office-page",
        modificationTimestamp: null,
        raw: officeRaw.OfficeSocialMedia[0],
      },
    ]);
    assert.deepEqual(coListAgentKeysFromRaw(propertyRaw), ["agent-2", "agent-3"]);
    assert.deepEqual(coListOfficeKeysFromRaw(propertyRaw), ["office-2", "office-3"]);
  });

  it.effect("validates pagination options as typed Effect failures", () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(
        validateListOptions("properties.list", { limit: 0 }),
      );
      const failure = Exit.findErrorOption(exit);

      assert.equal(Exit.isFailure(exit), true);
      assert.equal(failure._tag, "Some");
      if (failure._tag === "Some") {
        assert.equal(failure.value instanceof DdfDbClientValidationError, true);
        assert.equal(failure.value.message, "limit must be an integer from 1 to 500");
      }
    }),
  );
});
