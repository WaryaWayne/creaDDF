export type ODataListQuery<Field extends string = string> = { select?: ReadonlyArray<Field>; count?: boolean; filter?: string; top?: number; skip?: number; orderby?: string | ReadonlyArray<string> }
export type ODataGetQuery<Field extends string = string> = { select?: ReadonlyArray<Field> }
export type ReplicationQuery<Field extends string = string> = { select?: ReadonlyArray<Field>; count?: boolean; filter?: string; orderby?: string | ReadonlyArray<string> }
export type LeadInput = {
  Culture: string
  MemberKey: string
  ListingKey: string
  SenderName: string
  SenderEmailAddress: string
  SenderPhoneNumber?: number | null
  PreferredMethodContact: string
  SenderPhoneExtension?: number | null
  Message: string
}
