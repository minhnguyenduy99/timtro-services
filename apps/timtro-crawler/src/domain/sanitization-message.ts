export type SanitizationMessage = {
  rawPostId: string;
  contentHash: string;
  crawlRunId?: string;
  source: "fb";
  groupId: string;
  postId: string;
};

export function createSanitizationMessage(input: Omit<SanitizationMessage, "source">): SanitizationMessage {
  return {
    ...input,
    source: "fb"
  };
}
