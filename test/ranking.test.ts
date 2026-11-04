import { describe, expect, it } from "vitest";
import { baseScore, interleave, latestEpisode, nameFromEmail, nextEpisode, rankWatchlist } from "../shared/ranking";

describe("rankWatchlist", () => {
  const item = (name: string, wantedBy: number[], voteAverage: number, voteCount: number, addedAt = "2026-11-01") => ({
    name,
    wantedBy,
    voteAverage,
    voteCount,
    addedAt,
  });

  it("puts titles you both want above titles one of you wants", () => {
    const ranked = rankWatchlist([
      item("great but single", [1], 9.0, 20000),
      item("ok but both", [1, 2], 6.0, 100),
      item("good single", [2], 8.0, 5000),
    ]);
    expect(ranked.map((r) => r.name)).toEqual(["ok but both", "great but single", "good single"]);
  });

  it("orders within a group by weighted score, then newest", () => {
    const ranked = rankWatchlist([
      item("few votes, high avg", [1], 9.5, 3),
      item("many votes", [1], 8.2, 30000),
      item("tie old", [1], 7, 1000, "2026-01-01"),
      item("tie new", [1], 7, 1000, "2026-06-01"),
    ]);
    expect(ranked.map((r) => r.name)).toEqual(["many votes", "tie new", "tie old", "few votes, high avg"]);
  });
});

describe("baseScore", () => {
  it("pulls low-vote titles toward the average", () => {
    expect(baseScore(10, 1)).toBeLessThan(7);
    expect(baseScore(8, 100000)).toBeCloseTo(8, 1);
    expect(baseScore(null, null)).toBe(6.5);
  });
});

describe("interleave", () => {
  it("round-robins and drops duplicates", () => {
    const out = interleave([[1, 2, 3], [4, 2], [5]], String);
    expect(out).toEqual([1, 4, 5, 2, 3]);
  });
});

describe("episodes", () => {
  const seasons = [
    { season: 1, episodes: 3 },
    { season: 2, episodes: 2 },
  ];
  it("finds the latest watched episode", () => {
    expect(
      latestEpisode([
        { season: 1, episode: 3 },
        { season: 2, episode: 1 },
        { season: null, episode: null },
        { season: 1, episode: 1 },
      ]),
    ).toEqual({ season: 2, episode: 1 });
    expect(latestEpisode([])).toBeNull();
  });
  it("works out the next episode across seasons", () => {
    expect(nextEpisode(seasons, null)).toEqual({ season: 1, episode: 1 });
    expect(nextEpisode(seasons, { season: 1, episode: 2 })).toEqual({ season: 1, episode: 3 });
    expect(nextEpisode(seasons, { season: 1, episode: 3 })).toEqual({ season: 2, episode: 1 });
    expect(nextEpisode(seasons, { season: 2, episode: 2 })).toBeNull();
  });
});

describe("nameFromEmail", () => {
  it("uses the first part of the address", () => {
    expect(nameFromEmail("dan.smith@example.com")).toBe("Dan");
    expect(nameFromEmail("alex@example.com")).toBe("Alex");
  });
});
