export type DailyFlashcard = {
  word: string;
  article: string;
  plural: string;
  meaning: string;
  meanings?: string[];
  pos?: string;
  exampleSentences: string[];
  tags: string[];
};
