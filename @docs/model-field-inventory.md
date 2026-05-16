# Model Field Inventory
Generated from the embedded OpenAPI model in https://ddfapi-docs.realtor.ca/ on 2026-05-04. Use this as a field checklist when finishing schemas and SDK response validators.

## DDF.Core.Entities.Property
| Field | Type | Nullable | Format | Description |
| --- | --- | --- | --- | --- |
| ListingKey | string | yes |  | A unique identifier for this record from the immediate source. |
| PropertySubType | String | yes | Enum: PropertySubType | A list of types of residential and residential lease properties, i.e. Condo, etc. Or a list of Sub Types for Mobile, such as Expando, Manufactured, Modular, etc. |
| DocumentsAvailable | Array of Strings | yes | Enum: DocumentsAvailable | A list of the Documents available for the property. Knowing what documents are available for the property is valuable information. |
| LeaseAmount | number | yes | double | The amount of any lease the business pays for it's current location. |
| LeaseAmountFrequency | String | yes | Enum: FeeFrequency | The frequency of the LeaseAmount is paid. Monthly, weekly, annual, etc. |
| BusinessType | Array of Strings | yes | Enum: BusinessType | The type of business being sold. Retail, Recreation, Restaurant, Residential, etc. |
| LeasePerUnit | String | yes | Enum: LotSizeUnits | A pick list of the unit of measurement used for the lease per unit. |
| PricePerUnit | String | yes | Enum: LotSizeUnits | A pick list of the unit of measurement used for the price per unit. |
| WaterBodyName | string | yes |  | The name, if known, of the body of water on which the property is located. (E.g., lake name, river name, ocean name, sea name, canal name). |
| View | Array of Strings | yes | Enum: View | A view as seen from the listed property. |
| NumberOfBuildings | integer | yes | int32 | Total number of separate buildings included in the income property. |
| NumberOfUnitsTotal | integer | yes | int32 | Total number of units included in the income property, occupied or unoccupied. |
| LotFeatures | Array of Strings | yes | Enum: LotFeatures | A list of features or description of the lot included in the sale/lease. |
| LotSizeArea | number | yes | double | The total area of the lot. See Lot Size Units for the units of measurement (Square Feet, Square Meters, Acres, etc.). |
| LotSizeDimensions | string | yes |  | The dimensions of the lot minimally represented as length and width (i.e. 250 x 180) or a measurement of all sides of the polygon representing the property lines of the property. i.e. 30 x 50 x 120 x 60 x 22. |
| LotSizeUnits | String | yes | Enum: LotSizeUnits | A pick list of the unit of measurement for the area. i.e. Square Feet, Square Meters, Acres, etc. |
| PoolFeatures | Array of Strings | yes | Enum: PoolFeatures | A list of features or description of the pool included in the sale/lease. |
| RoadSurfaceType | Array of Strings | yes | Enum: RoadSurfaceType | Pick list of types of surface of the Road to access the property. The surface of the road(s) for access to the property is an important factor in determining value of the property and it’s appropriateness for intended use. |
| CurrentUse | Array of Strings | yes | Enum: CurrentUse | A list of the type(s) of current use of the property. The current use of the property is an important factor in understanding the overall condition of the land and determining it's appropriateness for intended use. |
| PossibleUse | Array of Strings | yes | Enum: PossibleUse | A list of the type(s) of possible or best uses of the property. Probable use gives a good indication of what the best use or potential use of the property could be. i.e. Primary, Vacation, Investment, Rental, Retirement. |
| AnchorsCoTenants | string | yes |  | The main or most notable tenants as well as other tenants of the shopping center or mall in which the commercial property is located. |
| WaterfrontFeatures | Array of Strings | yes | Enum: WaterfrontFeatures | A list of the features or description of the waterfront on which the property is located. |
| CommunityFeatures | Array of Strings | yes | Enum: CommunityFeatures | A list of features related to, or available within, the community. |
| FrontageLengthNumeric | number | yes | double | A numeric representation of the length of the frontage. |
| FrontageLengthNumericUnits | String | yes | Enum: LinearUnits | The unit of measurement used for the value in the FrontageLengthNumeric fields. e.g. feet, meters, etc. |
| Fencing | Array of Strings | yes | Enum: Fencing | A list of types of fencing at the property. |
| Appliances | Array of Strings | yes | Enum: Appliances | A list of the appliances that will be included in the sale/lease of the property. |
| OtherEquipment | Array of Strings | yes | Enum: OtherEquipment | A list of other equipment that will be included in the sale of the property. |
| SecurityFeatures | Array of Strings | yes | Enum: SecurityFeatures | A list describing the security features included in the sale/lease. |
| TotalActualRent | number | yes | double | Total actual rent currently being collected from tenants of the income property. |
| ExistingLeaseType | Array of Strings | yes | Enum: ExistingLeaseType | Information about the status of the existing lease on the property. i.e. Net, Gross, Percentage,, etc. |
| AssociationFee | number | yes | double | A fee paid by the homeowner to the Home Owners Association which is used for the upkeep of the common area, neighborhood or other association related benefits. |
| AssociationFeeFrequency | String | yes | Enum: FeeFrequency | The frequency the Association fee is paid. For example, Weekly, Monthly, Annually, Bi-Monthly, One Time, etc. |
| AssociationName | string | yes |  | The name of the Home Owners Association. |
| AssociationFeeIncludes | Array of Strings | yes | Enum: AssociationFeeIncludes | Services included with the association fee. For example Landscaping, Trash, Water, etc. |
| OriginalEntryTimestamp | String | yes | Enum: DateTime | The date and time the record was inserted into the source system (in Zulu time (UTC)). |
| ModificationTimestamp | String | yes | Enum: DateTime | The date and time the record was last updated in the source system (in Zulu time (UTC)). |
| AvailabilityDate | string | yes | date-time | The date the property will be available for possession/occupation. |
| ListingId | string | yes |  | The well known identifier for the listing. The value may be identical to that of the Listing Key, but the Listing ID is intended to be the value used by a human to retrieve the information about a specific listing. In a multiple originating system or a merged system, this value may not be unique and may require the use of the provider system to create a synthetic unique value. |
| ListAgentNationalAssociationId | string | yes |  | A system unique identifier. This is the primary MemberKey that the property belongs to. |
| CoListAgentNationalAssociationId | string | yes |  | A system unique identifier. This is the secondary MemberKey that the property belongs to. |
| CoListAgentNationalAssociationId2 | string | yes |  | A system unique identifier. This is the secondary MemberKey that the property belongs to. |
| CoListAgentNationalAssociationId3 | string | yes |  | A system unique identifier. This is the secondary MemberKey that the property belongs to. |
| InternetEntireListingDisplayYN | boolean | yes |  | A yes/no field that states the seller has allowed the listing to be displayed on Internet sites. |
| StandardStatus | String | yes | Enum: StandardStatus | The status of the listing. This is a Single Select field. |
| StatusChangeTimestamp | String | yes | Enum: DateTime | The transactional timestamp automatically recorded by the MLS system representing the date/time the listing's status was last changed (in Zulu time (UTC)). |
| PublicRemarks | string | yes |  | Text remarks that may be displayed to the public. |
| ListPrice | number | yes | double | The current price of the property as determined by the seller and the seller's broker. For auctions this is the minimum or reserve price. |
| Inclusions | string | yes |  | Portable elements of the property that will be included in the sale. |
| ListOfficeKey | string | yes |  | A system unique identifier. This is the OfficeKey that the property belongs to. |
| CoListOfficeKey | string | yes |  | A system unique identifier. This is the secondary OfficeKey that the property belongs to. |
| CoListOfficeKey2 | string | yes |  | A system unique identifier. This is the secondary OfficeKey that the property belongs to. |
| CoListOfficeKey3 | string | yes |  | A system unique identifier. This is the secondary OfficeKey that the property belongs to. |
| ListOfficeNationalAssociationId | string | yes |  | A system unique identifier. This is the primary OfficeKey that the property belongs to. |
| CoListOfficeNationalAssociationId | string | yes |  | A system unique identifier. This is the secondary OfficeKey that the property belongs to. |
| CoListOfficeNationalAssociationId2 | string | yes |  | A system unique identifier. This is the secondary OfficeKey that the property belongs to. |
| CoListOfficeNationalAssociationId3 | string | yes |  | A system unique identifier. This is the secondary OfficeKey that the property belongs to. |
| CoListAgentKey | string | yes |  | A system unique identifier. This is the secondary MemberKey that the property belongs to. |
| CoListAgentKey2 | string | yes |  | A system unique identifier. This is the secondary MemberKey that the property belongs to. |
| CoListAgentKey3 | string | yes |  | A system unique identifier. This is the secondary MemberKey that the property belongs to. |
| ListAgentKey | string | yes |  | A system unique identifier. This is the MemberKey that the property belongs to. |
| InternetAddressDisplayYN | boolean | yes |  | A yes/no field that states the seller has allowed the listing address to be displayed on Internet sites. |
| ListingURL | string | yes |  | Provides a link to the specific listing on realtor.ca. The UTM codes should be removed when performing any ODATA operation with this field. |
| OriginatingSystemName | string | yes |  | The name of the Originating record provider. Most commonly the name of the MLS. The place where the listing is originally input by the member. The legal name of the company. |
| PhotosCount | integer | yes | int32 | The total number of pictures or photos included with the listing. |
| PhotosChangeTimestamp | String | yes | Enum: DateTime | System generated timestamp of when the last update or change to the photos for this listing was made (in Zulu time (UTC)). |
| CommonInterest | String | yes | Enum: CommonInterest | Common Interest is a type of ownership in a property that is composed of an individual lot or unit and a share of the ownership or use of common areas. |
| ListAOR | String | yes | Enum: AOR | The responsible board or association of REALTORS® for this listing. |
| ListAORKey | string | yes |  | A system unique identifier. Specifically, in aggregation systems, the ListAOR Key is the unique identifier of the primary board or association of REALTORS providing the property data, from the system where the record was retrieved. |
| UnparsedAddress | string | yes |  | The UnparsedAddress is a text representation of the address with the full civic location as a single entity. It may optionally include any of City, StateOrProvince, PostalCode and Country. |
| PostalCode | string | yes |  | The postal code portion of a street or mailing address. |
| SubdivisionName | string | yes |  | A neighborhood, community, complex or builder tract. |
| StateOrProvince | String | yes | Enum: StateOrProvince | Text field containing the accepted postal abbreviation for the state or province. |
| StreetDirPrefix | String | yes | Enum: StreetDir | The direction indicator that precedes the listed property's street name. |
| StreetDirSuffix | String | yes | Enum: StreetDir | The direction indicator that follows a listed property's street address. |
| StreetName | string | yes |  | The street name portion of a listed property's street address. |
| StreetNumber | string | yes |  | The street number portion of a listed property's street address. In some areas the street number may contain non-numeric characters. This field can also contain extensions and modifiers to the street number, such as "1/2" or "-B". This street number field should not include Prefixes, Direction or Suffixes. |
| StreetSuffix | String | yes | Enum: StreetSuffix | The suffix portion of a listed property's street address. |
| UnitNumber | string | yes |  | Text field containing the number or portion of a larger building or complex. Unit Number should appear following the street suffix or, if it exists, the street suffix direction, in the street address. Examples are: "APT G", "55", etc. |
| Country | String | yes | Enum: Country | The country in a postal address. |
| City | string | yes |  | The city in listing address. |
| Directions | string | yes |  | Driving directions to the property. |
| Latitude | number | yes | double | The geographic latitude of some reference point on the property, specified in degrees and decimal parts. Positive numbers must not include the plus symbol. |
| Longitude | number | yes | double | The geographic longitude of some reference point on the property, specified in degrees and decimal parts. Positive numbers must not include the plus symbol. |
| CityRegion | string | yes |  | A sub-section or area of a defined city. Examples would be Yorkville in Toronto, ON, Fairview in Vancouver, BC |
| MapCoordinateVerifiedYN | String | yes | Enum: Boolean | This flag is deprecated and should not be used by clients. Instead, use the GeoCodeManualYN flag to determine whether geocoordinates were manually provided by Boards or Members. |
| GeocodeManualYN | boolean | yes |  | This flag indicates whether the geocoordinates in the response were manually provided, such as by Boards or Members. If the flag is set to false, users can decide whether to geocode those listings themselves or review them. |
| ParkingTotal | integer | yes | int32 | The total number of parking spaces included in the sale. |
| YearBuilt | integer | yes | int32 | The year that an occupancy permit is first granted for the house or other local measure of initial habitability of the build. |
| BathroomsPartial | integer | yes | int32 | The number of partial bathrooms in the property being sold/leased. |
| BathroomsTotalInteger | integer | yes | int32 | The simple sum of the number of bathrooms. |
| BedroomsTotal | integer | yes | int32 | The total number of bedrooms in the dwelling. |
| BuildingAreaTotal | number | yes | double | Total area of the structure. Includes both finished and unfinished areas. |
| BuildingAreaUnits | String | yes | Enum: AreaUnits | A pick list of the unit of measurement for the area (e.g., Square Feet, Square Meters). |
| BuildingFeatures | Array of Strings | yes | Enum: BuildingFeatures | Features or amenities of the building or business park. |
| AboveGradeFinishedArea | number | yes | double | Finished area within the structure that is at or above the surface of the ground. |
| AboveGradeFinishedAreaUnits | String | yes | Enum: AreaUnits | A pick list of the unit of measurement for the area (e.g., Square Feet, Square Meters). |
| AboveGradeFinishedAreaSource | String | yes | Enum: SquareFootageSource | The source of the measurements. This is a pick list of options showing the source of the measurement (e.g., Agent, Assessor, Estimate). |
| AboveGradeFinishedAreaMinimum | number | yes | double | The minimum finished area within the structure that is at or above the surface of the ground. |
| AboveGradeFinishedAreaMaximum | number | yes | double | The maximum finished area within the structure that is at or above the surface of the ground. |
| BelowGradeFinishedArea | number | yes | double | The finished area within the structure that is below ground. |
| BelowGradeFinishedAreaUnits | String | yes | Enum: AreaUnits | A pick list of the unit of measurement for the area (e.g., Square Feet, Square Meters). |
| BelowGradeFinishedAreaSource | String | yes | Enum: SquareFootageSource | The source of the measurements. This is a pick list of options showing the source of the measurement (e.g., Agent, Assessor, Estimate). |
| BelowGradeFinishedAreaMinimum | number | yes | double | The minimum finished area within the structure that is below ground. |
| BelowGradeFinishedAreaMaximum | number | yes | double | The maximum finished area within the structure that is below ground. |
| LivingArea | number | yes | double | The total livable area within the structure. |
| LivingAreaUnits | String | yes | Enum: AreaUnits | A pick list of the unit of measurement for the area (e.g., Square Feet, Square Meters). |
| LivingAreaSource | String | yes | Enum: SquareFootageSource | The source of the measurements. This is a pick list of options showing the source of the measurement (e.g., Agent, Assessor, Estimate). |
| LivingAreaMinimum | number | yes | double | The minimum livable area within the structure. |
| LivingAreaMaximum | number | yes | double | The maximum livable area within the structure. |
| FireplacesTotal | integer | yes | int32 | The total number of fireplaces included in the property. |
| FireplaceYN | boolean | yes |  | Does the property include a fireplace. |
| FireplaceFeatures | Array of Strings | yes | Enum: FireplaceFeatures | A list of features or description of the fireplace(s) included in the sale/lease. |
| ArchitecturalStyle | Array of Strings | yes | Enum: ArchitecturalStyle | A list describing the style of the structure. For example, Victorian, Ranch, Craftsman, etc. |
| Heating | Array of Strings | yes | Enum: Heating | A list describing the heating features of the property. |
| FoundationDetails | Array of Strings | yes | Enum: FoundationDetails | A list of the type(s) of foundation on which the property sits. |
| Basement | Array of Strings | yes | Enum: Basement | A list of information and features about the basement. i.e. None/Slab, Finished, Partially Finished, Crawl Space, Dirt, Outside Entrance, Radon Mitigation |
| ExteriorFeatures | Array of Strings | yes | Enum: ExteriorFeatures | A list of features or description of the exterior of the property included in the sale/lease. |
| Flooring | Array of Strings | yes | Enum: Flooring | A list of the type(s) of flooring found within the property. |
| ParkingFeatures | Array of Strings | yes | Enum: ParkingFeatures | A list of features or description of the parking included in the sale/lease. |
| Cooling | Array of Strings | yes | Enum: Cooling | A list describing the cooling or air conditioning features of the property. |
| PropertyCondition | Array of Strings | yes | Enum: PropertyCondition | A list describing the condition of the property and any structures included in the sale. |
| Roof | Array of Strings | yes | Enum: Roof | A list describing the type or style of roof. For example Spanish Tile, Composite, Shake, etc. |
| ConstructionMaterials | Array of Strings | yes | Enum: ConstructionMaterials | A list of the materials that were used in the construction of the property. |
| Rooms | array<DDF.Core.Entities.PropertyRoom> | yes |  | A collection of types of rooms and details/features about the given room. |
| Stories | number | yes | double | The number of floors in the property being sold. |
| PropertyAttachedYN | boolean | yes |  | A flag indicating that the primary structure is attached to another structure that is not included in the sale. i.e. one unit of a duplex. As with all flags, the field may be null. |
| AccessibilityFeatures | Array of Strings | yes | Enum: AccessibilityFeatures | A list or description of the accessibility features included in the sale/lease. |
| BedroomsAboveGrade | integer | yes | int32 | The total number of bedrooms within the structure that is above ground. |
| BedroomsBelowGrade | integer | yes | int32 | The total number of bedrooms within the structure that is below ground. |
| Zoning | string | yes |  | A division of the city into areas of different permissible land uses. This Zone field should be used for the short code that is commonly used. For full textual descriptions please use the ZoningDescription field. |
| ZoningDescription | string | yes |  | A list of descriptions of the zoning of the property. The zoning codes are often non-descriptive and variant. Zoning Description is a more descriptive form of the zoning for the property, i.e. Agricultural, Residential, Rezone Possible, etc. Specific zone codes must be added to the Zoning field. |
| TaxAnnualAmount | number | yes | double | The annual property tax amount as of the last assessment made by the taxing authority. |
| TaxBlock | string | yes |  | A type of legal description for land in developed areas where streets or other rights-of-ways delineate large parcels of land referred to as divided into lots on which homes or other types of developments are built. |
| TaxLot | string | yes |  | A type of legal description for land in developed areas where streets or other rights-of-ways delineate large parcels of land referred to as divided into lots on which homes or other types of developments are built. |
| TaxYear | integer | yes | int32 | The year in with the last assessment of the property value/tax was made. |
| StructureType | Array of Strings | yes | Enum: StructureType | The type of structure that the property completely or partially encompasses. For example, House or Cabin are the overall structure and typically sold or leased as a whole. |
| ParcelNumber | string | yes |  | A number used to uniquely identify a parcel or lot. This number is typically issued by the county or county assessor. The AP number format varies from county to county. It is recommended that all Parcel Numbers be transmitted without dashes or hyphens. |
| Utilities | Array of Strings | yes | Enum: Utilities | A list of the utilities for the property being sold/leased. |
| IrrigationSource | Array of Strings | yes | Enum: IrrigationSource | The source which the property receives its water for irrigation. |
| WaterSource | Array of Strings | yes | Enum: WaterSource | A list of the source(s) of water for the property. |
| Sewer | Array of Strings | yes | Enum: Sewer | A list describing the sewer or septic features of the property. |
| Electric | Array of Strings | yes | Enum: Electric | A list of electric-service related features of the property (e.g. 110 Volt, 3 Phase, 220 Volt, RV Hookup). |
| Media | array<DDF.Core.Entities.Media> | yes |  | A collection of the types of media fields available for this Property. |

## DDF.Core.Entities.PropertyRoom
| Field | Type | Nullable | Format | Description |
| --- | --- | --- | --- | --- |
| RoomKey | string | yes |  | A unique identifier for this record. |
| ListingId | string | yes |  | This is the foreign ID relating to the Property Resource. The well known identifier for the listing. |
| ListingKey | string | yes |  | This is the foreign key relating to the property resource. A unique identifier for this record from the immediate source. |
| ModificationTimestamp | String | no | date-time | Date/time this record was last modified (in Zulu time (UTC)). |
| RoomDescription | string | yes |  | A textual description of the given room. |
| RoomDimensions | string | yes |  | A textual description of the dimensions of the given room. |
| RoomLength | number | yes | double | A numeric representation of the length of the given room. See the RoomLengthWidthUnits for the unit of measurement used for the length and width. |
| RoomLevel | String | yes | Enum: RoomLevel | The level within the dwelling on which the given room is located. |
| RoomWidth | number | yes | double | A numeric representation of the width of the given room. |
| RoomLengthWidthUnits | String | yes | Enum: LinearUnits | The unit of measurement used for the value in the RoomLength and the RoomWidth fields. e.g. feet, meters, etc. |
| RoomType | String | yes | Enum: RoomType | The type of room being described by the other fields in the PropertyRooms resource. |

## DDF.Core.Entities.Media
| Field | Type | Nullable | Format | Description |
| --- | --- | --- | --- | --- |
| MediaKey | string | yes |  | A unique identifier for this record from the immediate source. This may be a number, or string that can include URI or other forms. This is the system you are connecting to and not necessarily the original source of the record. |
| LongDescription | string | yes |  | The full description of the object. |
| MediaURL | string | yes |  | The URI to the media file referenced by this record. |
| ModificationTimestamp | String | yes | Enum: DateTime | Date/time the record was last modified (in Zulu time (UTC)). |
| Order | integer | yes | int32 | The order in which the media object is displayed. Zero is the primary photo per RETS convention. |
| PreferredPhotoYN | boolean | yes |  | When set to true, the media record in question is the preferred photo. This will typically mean the photo to be shown when only one of the photos is to be displayed. |
| ResourceRecordId | string | yes |  | The well known identifier of the related record from the source resource. |
| ResourceRecordKey | string | yes |  | The primary key of the related record from the source resource. |
| ResourceName | String | yes | Enum: ResourceName | The resource or table of the listing or other record the media relates to. i.e. Property, Member, Office, etc. |
| MediaCategory | String | yes | Enum: MediaCategory | Category describing the , Photos, Documents, Video, Unbranded Virtual Tour, Branded Virtual Tour, Floor Plan, Logo |

## DDF.Core.Entities.Member
| Field | Type | Nullable | Format | Description |
| --- | --- | --- | --- | --- |
| MemberKey | string | yes |  | A unique identifier for this record. |
| MemberMlsId | string | yes |  | The local, well-known identifier. This value may not be unique, specifically in the case of aggregation systems, this value should be the identifier from the original system. |
| OfficeKey | string | yes |  | The unique identifier of the member's office. |
| OfficeNationalAssociationId | string | yes |  | The national association ID of the office. i.e. In Canada, this is the Organization ID of the Office. |
| JobTitle | string | yes |  | The title or position of the member within their organization. |
| MemberAORKey | string | yes |  | A system unique identifier. This is the Board ID of the Member's Primary Board or Association of REALTORS. |
| MemberAddress1 | string | yes |  | The street number, direction, name and suffix of the member. |
| MemberAddress2 | string | yes |  | The unit/suite number of the member. |
| MemberFax | string | yes |  | North American 10 digit phone numbers should be in the format of ###-###-#### (separated by hyphens). Other conventions should use the common local standard. International numbers should be preceded by a plus symbol. |
| MemberFirstName | string | yes |  | The first name of the Member. |
| MemberLastName | string | yes |  | The last name of the Member. |
| MemberMiddleName | string | yes |  | The middle name of the Member. |
| MemberNamePrefix | string | yes |  | Prefix to the name (e.g. Dr. Mr. Ms. etc.) |
| MemberNameSuffix | string | yes |  | Suffix to the surname (e.g. Esq., Jr., III etc.) |
| MemberNationalAssociationId | string | yes |  | The national association ID of the member. i.e. In Canada this is the CREA ID of the member. |
| MemberNickname | string | yes |  | An alternate name used by the Member, usually as a substitute for the first name. |
| MemberOfficePhone | string | yes |  | North American 10 digit phone numbers should be in the format of ###-###-#### (separated by hyphens). Other conventions should use the common local standard. International numbers should be preceded by a plus symbol. |
| MemberOfficePhoneExt | string | yes |  | The extension of the given phone number (if applicable). |
| MemberPostalCode | string | yes |  | The postal code of the member. |
| MemberPager | string | yes |  | North American 10 digit phone numbers should be in the format of ###-###-#### (separated by hyphens). Other conventions should use the common local standard. International numbers should be preceded by a plus symbol. |
| MemberTollFreePhone | string | yes |  | North American 10 digit phone numbers should be in the format of ###-###-#### (separated by hyphens). Other conventions should use the common local standard. International numbers should be preceded by a plus symbol. |
| ModificationTimestamp | String | yes | Enum: DateTime | Date/time the roster (member or office) record was last modified (in Zulu time (UTC)). |
| OriginalEntryTimestamp | String | yes | Enum: DateTime | Date/time the roster (member or office) record was originally input into the source system (in Zulu time (UTC)). |
| MemberCity | string | yes |  | The city of the member. |
| MemberAOR | String | yes | Enum: AOR | The Member's Primary Board Name or Association's Name of REALTORS. |
| MemberCountry | String | yes | Enum: Country | The country in a postal address. |
| MemberDesignation | Array of Strings | yes | Enum: MemberDesignation | Designations and certifications acknowledging experience and expertise in various real estate sectors are awarded by CREA and each affiliated group upon completion of required courses |
| MemberLanguages | Array of Strings | yes | Enum: MemberLanguages | The languages the member speaks. |
| MemberSocialMedia | array<DDF.Core.Entities.SocialMedia> | yes |  | A collection of the types of social media fields available for this member. The collection includes the type of system and other details pertinent about social media. |
| Media | array<DDF.Core.Entities.Media> | yes |  | A collection of the types of media fields available for this Member. |
| MemberStateOrProvince | String | yes | Enum: StateOrProvince | The state or province in which the member is addressed. |
| MemberStatus | String | yes | Enum: MemberStatus | The current status of the member. |
| MemberType | String | yes | Enum: MemberType | The type of member. i.e. Agent, Broker, Office Manager, Appraiser, Assistants, MLO, Realtor, Association Staff, MLS Staff, etc. |
| MemberEmailYN | boolean | yes |  | This flag signifies the availability of a REALTOR®’s email address. It is intended for clients who use the Lead API endpoint to communicate with Realtors. If the flag is false, these clients should turn off the email REALTOR® function for the respective REALTOR®. Clients not using Lead API endpoint can disregard this field. |

## DDF.Core.Entities.OpenHouse
| Field | Type | Nullable | Format | Description |
| --- | --- | --- | --- | --- |
| OpenHouseKey | string | yes |  | A unique identifier for this record from the immediate source. |
| ListingKey | string | yes |  | A unique identifier for the listing record related to this Open House. |
| ListingId | string | yes |  | The well known identifier for the listing related to this Open House. |
| OpenHouseDate | string | yes | date-time | The date on which the open house will occur. |
| OpenHouseStartTime | string | yes |  | The time the open house begins (in local time). |
| OpenHouseEndTime | string | yes |  | The time the open house ends (in local time). |
| OpenHouseRemarks | string | yes |  | Comments, instructions or information about the open house. |
| OpenHouseType | String | yes | Enum: OpenHouseType | The type of open house. i.e. Public, Broker, Office, Association, Private (invitation or targeted publication). |
| OpenHouseStatus | String | yes | Enum: OpenHouseStatus | Status of the open house, i.e. Active, Cancelled, Ended. |
| LivestreamOpenHouseURL | String | yes |  | A link to an open house livestream event |

## DDF.Core.Entities.Destination
| Field | Type | Nullable | Format | Description |
| --- | --- | --- | --- | --- |
| DestinationId | integer | no | int32 | A unique identifier for this record. |
| DestinationName | string | yes |  | The name of the destination. |
| DestinationUrl | string | yes |  | The URL to the destination referenced by this record. |
| DestinationType | integer | yes | int32 | The type of destination. i.e. Technology Provider, Partner, etc. |
| DestinationStatus | integer | yes | int32 | The status of the destination. i.e. Active, Inactive, Suspended |
| MemberFirstName | string | yes |  | The first name of the member. |
| MemberLastName | string | yes |  | The last name of the member. |
| MemberKey | string | yes |  | The unique identifier (MemberKey) of the member who owns the destination. |
| OriginalEntryTimestamp | string | yes | date-time | Date/time the destination record was originally input into the source system (in Zulu time (UTC)). |
| ModificationTimestamp | string | yes | date-time | Date/time the destination record was last modified (in Zulu time (UTC)). |
| FullNSP | boolean | no |  | A flag indicating that if the destination is Full NSP. |

## DDF.Core.Entities.Office
| Field | Type | Nullable | Format | Description |
| --- | --- | --- | --- | --- |
| OfficeKey | string | yes |  | A unique identifier for this record from the immediate source. This is the string only key and used as an alternative to the OfficeKeyNumeric fields. |
| OfficeMlsId | string | yes |  | The local, well-known identifier. This value may not be unique, specifically in the case of aggregation systems, this value should be the identifier from the original system. |
| OfficeAORKey | string | yes |  | A system unique identifier. This is the Board ID of the Office's Primary Board or Association of REALTORS. |
| OfficeNationalAssociationId | string | yes |  | The national association ID of the office. i.e. In Canada, this is the CREA Organization ID of the Office. |
| FranchiseNationalAssociationId | string | yes |  | The national association ID of the Franchisor. In Canada this would be the CREAID |
| OfficeBrokerNationalAssociationId | string | yes |  | The national association Id of the Brokerage Owner. In Canada this would be the CREAID |
| OfficeAddress1 | string | yes |  | The street number, direction, name and suffix of the office. |
| OfficeAddress2 | string | yes |  | The unit/suite number of the office. |
| OfficeCity | string | yes |  | The city of the office. |
| OfficeFax | string | yes |  | North American 10 digit fax numbers should be in the format of ###-###-#### (separated by hyphens). Other conventions should use the common local standard. International numbers should be preceded by a plus symbol. |
| OfficeName | string | yes |  | The legal name of the brokerage. |
| OfficePhone | string | yes |  | North American 10 digit phone numbers should be in the format of ###-###-#### (separated by hyphens). Other conventions should use the common local standard. International numbers should be preceded by a plus symbol. |
| OfficePhoneExt | string | yes |  | The extension of the given phone number (if applicable). |
| OfficePostalCode | string | yes |  | The postal code of the office. |
| Media | array<DDF.Core.Entities.Media> | yes |  | A collection of the types of media fields available for this Office. |
| OfficeSocialMedia | array<DDF.Core.Entities.SocialMedia> | yes |  | A collection of the types of social media fields available for this office. The collection includes the type of system and other details pertinent about social media |
| ModificationTimestamp | String | yes | Enum: DateTime | Date/time the roster (member or office) record was last modified (in Zulu time (UTC)). |
| OriginalEntryTimestamp | String | yes | Enum: DateTime | Date/time the office record was originally input into the source system (in Zulu time (UTC)). |
| OfficeType | String | yes | Enum: OfficeType | The type of business conducted by the office. i.e. Real Estate, Appraiser, etc. |
| OfficeStateOrProvince | String | yes | Enum: StateOrProvince | The state or province in which the office is located. |
| OfficeAOR | String | yes | Enum: AOR | The Office's Board or Association of REALTORS. |
| OfficeStatus | String | yes | Enum: OfficeStatus | Is the office active, inactive or under disciplinary action. |
| OfficeCountry | String | yes | Enum: Country | The country in a postal address. |

## DDF.Core.Entities.PropertyIdentifier
| Field | Type | Nullable | Format | Description |
| --- | --- | --- | --- | --- |
| ListingKey | string | yes |  | A unique identifier for this record from the immediate source. |
| ModificationTimestamp | string | yes | date-time | The date and time the record was last updated in the source system (in Zulu time (UTC)). |

## DDF.Core.Entities.MemberIdentifier
| Field | Type | Nullable | Format | Description |
| --- | --- | --- | --- | --- |
| MemberKey | string | yes |  | A unique identifier for this record. |
| ModificationTimestamp | string | yes | date-time | Date/time the roster (member or office) record was last modified (in Zulu time (UTC)). |

## DDF.Core.Entities.OfficeIdentifier
| Field | Type | Nullable | Format | Description |
| --- | --- | --- | --- | --- |
| OfficeKey | string | yes |  | A unique identifier for this record from the immediate source. This is the numeric only key and used as an alternative to the OfficeKey fields. |
| ModificationTimestamp | string | yes | date-time | Date/time the roster (member or office) record was last modified (in Zulu time (UTC)). |

## DDF.Core.Models.LeadModel
| Field | Type | Nullable | Format | Description |
| --- | --- | --- | --- | --- |
| Culture | string | no |  | The culture of the lead. Either en-CA or fr-CA. Default value is en-CA |
| MemberKey | string | no |  | The key of the related member for this lead. |
| ListingKey | string | no |  | The key of the related listing for this lead. |
| SenderName | string | no |  | The name of the lead. |
| SenderEmailAddress | string | no |  | The email address of the lead. |
| SenderPhoneNumber | integer | yes | int64 | The phone number of the lead. Required if PrefferedMethodContact is phone or text or if SenderPhoneExtension has a value. |
| PreferredMethodContact | string | no |  | The preffered method of contact for the lead. Either email, phone or text |
| SenderPhoneExtension | integer | yes | int32 | The extension of the leads phone number. |
| Message | string | no |  | The leads message to the member. This field has a 500 character limit. |

## DDF.Core.Models.LeadResponse
| Field | Type | Nullable | Format | Description |
| --- | --- | --- | --- | --- |
| details | string | yes |  |  |
| message | string | yes |  |  |
| code | string | yes |  |  |
| success | boolean | no |  |  |
