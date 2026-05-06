export type ODataListQuery<Field extends string = string> = {
  select?: ReadonlyArray<Field>;
  count?: boolean;
  filter?: string;
  top?: number;
  skip?: number;
  orderby?: string | ReadonlyArray<string>;
};
export type ODataGetQuery<Field extends string = string> = {
  select?: ReadonlyArray<Field>;
};
export type ReplicationQuery<Field extends string = string> = {
  select?: ReadonlyArray<Field>;
  count?: boolean;
  filter?: string;
  orderby?: string | ReadonlyArray<string>;
};
export type LeadInput = {
  Culture: "en-CA" | "fr-CA";
  MemberKey: string;
  ListingKey: string;
  SenderName: string;
  SenderEmailAddress: string;
  SenderPhoneNumber?: number | null;
  PreferredMethodContact: "email" | "phone" | "text";
  SenderPhoneExtension?: number | null;
  Message: string;
};
