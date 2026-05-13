import { Schema } from "effect";
import { MediaSchema } from "./mediaSchema";
import { ODataListEnvelopeSchema } from "./odata";

const SocialMediaTypeSchema = Schema.Literals([
  "Website",
  "FaceBook",
  "LinkedIn",
  "Twitter",
  "Instagram",
  "About Us Video",
  "About Me Video",
  "YouTube Channel",
]);

const ResourceNameSchema = Schema.Literals(["Office", "Member", "Property"]);

const OfficeTypeSchema = Schema.Literals([
  "Affiliate",
  "Real Estate",
  "Firm",
  "Territorial Association",
  "Franchisor",
  "Provincial Association",
  "National Association",
  "Sponsor",
  "Unknown",
  "Technology Provider",
  "DDF Third Party Destination",
  "MLS Provider",
]);

const OfficeStatusSchema = Schema.Literals(["Active", "Inactive"]);

const CountryMembers = new Set([
  "Canada", "United States of America (the)", "Algeria", "Afghanistan", "Albania", "American Samoa", "Andorra", "Angola", "Anguilla", "Antigua and Barbuda", "Argentina", "Armenia", "Aruba", "Australia", "Austria", "Azerbaijan", "Bahamas (the)", "Bahrain", "Bangladesh", "Barbados", "Belarus", "Belgium", "Belize", "Benin", "Bermuda", "Bhutan", "Bolivia (Plurinational State of)", "Bonaire, Sint Eustatius and Saba", "Bosnia and Herzegovina", "Botswana", "Bouvet Island", "Brazil", "British Indian Ocean Territory (the)", "Brunei Darussalam", "Bulgaria", "Burkina Faso", "Myanmar", "Burundi", "Côte d'Ivoire", "Cambodia", "Cameroon", "Cabo Verde", "Cayman Islands (the)", "Central African Republic (the)", "Chad", "Chile", "China", "Christmas Island", "Cocos (Keeling) Islands (the)", "Colombia", "Comoros (the)", "Congo (the Democratic Republic of the)", "Congo (the)", "Cook Islands (the)", "Costa Rica", "Croatia", "Cuba", "Curaçao", "Cyprus", "Czech Republic", "Denmark", "Djibouti", "Dominica", "Dominican Republic (the)", "East Timor", "Ecuador", "Egypt", "El Salvador", "Equatorial Guinea", "Eritrea", "Estonia", "Ethiopia", "Falkland Islands (the) (Malvinas)", "Faroe Islands (the)", "Fiji", "Finland", "France", "French Guiana", "French Polynesia (French Pacific Islands)", "French Southern Territories (the)", "Gabon", "Gambia", "Georgia", "Germany", "Ghana", "Gibraltar", "Greece", "Greenland", "Grenada", "Guadeloupe", "Guam", "Guatemala", "Guernsey", "Guinea", "Guinea-Bissau", "Guyana", "Haiti", "Heard Island and McDonald Islands", "Holy See (the)", "Honduras", "Hong Kong", "Hungary", "Iceland", "India", "Indonesia", "Iran (Islamic Republic of)", "Iraq", "Ireland (Eire)", "Isle of Man", "Israel", "Italy", "Jamaica", "Japan", "Jersey", "Jordan", "Kazakhstan", "Kenya", "Kiribati", "Korea (the Democratic People's Republic of)", "Korea (the Republic of)", "Kuwait", "Kyrgyzstan", "Laos People's Democratic Republic (the)", "Latvia", "Lebanon", "Lesotho", "Liberia", "Libya", "Liechtenstein", "Lithuania", "Luxembourg", "Macau", "Macedonia (the former Yugoslav Republic of)", "Madagascar", "Malawi", "Malaysia", "Maldives", "Mali", "Malta", "Marshall Islands (the)", "Martinique", "Mauritania", "Mauritius", "Mayotte", "Mexico", "Micronesia (Federated States of)", "Moldova (the Republic of)", "Monaco", "Mongolia", "Montenegro", "Montserrat", "Morocco", "Mozambique", "Namibia", "Nauru", "Nepal", "Netherlands (the)", "New Caledonia", "New Zealand", "Nicaragua", "Niger (the)", "Nigeria", "Niue", "Norfolk Island", "Northern Mariana Islands (the)", "Norway", "Oman", "Pakistan", "Palau", "Panama", "Papua New Guinea", "Paraguay", "Peru", "Philippines (the)", "Pitcairn Islands", "Poland", "Portugal", "Puerto Rico", "Qatar", "Réunion", "Romania", "Russia (the Russian Federation)", "Rwanda", "São Tome and Principe", "Saint Helena, Ascension and Tristan da Cunha", "Saint Kitts and Nevis", "Saint Lucia", "Saint Pierre and Miquelon", "Saint Vincent and The Grenadines", "Saint-Martin", "Samoa", "San Marino", "Saudi Arabia", "Senegal", "Serbia", "Seychelles", "Sierra Leone", "Singapore", "Sint Maarten (Dutch part)", "Slovakia", "Slovenia", "Solomon Islands", "Somalia", "South Africa", "South Georgia and the South Sandwich Islands", "Spain", "Sri Lanka", "Sudan (the)", "Suriname", "Svalbard and Jan Mayen", "Swaziland", "Sweden", "Switzerland", "Syria (Syrian Arab Republic)", "Taiwan (Republic of China)", "Tajikistan", "Tanzania, United Republic of", "Thailand", "Togo", "Tokelau", "Tonga", "Trinidad and Tobago", "Tunisia", "Turkey", "Turkmenistan", "Turks and Caicos Islands", "Tuvalu", "Uganda", "Ukraine", "United Arab Emirates (the)", "United Kingdom of Great Britain and Northern Ireland (the)", "United States Minor Outlying Islands (the)", "Uruguay", "Virgin Islands  (U.S.)", "Uzbekistan", "Vanuatu", "Venezuela (Bolivarian Republic of)", "Vietnam", "Virgin Islands (British)", "Wallis and Futuna", "Western Sahara", "Yemen", "Zambia", "Zimbabwe", "Åland Islands", "Kosovo", "Saint Barthélemy", "South Sudan",
]);

const CountrySchema = Schema.String.pipe(
  Schema.check(
    Schema.makeFilter((value) =>
      CountryMembers.has(value)
        ? undefined
        : { path: [], issue: "Expected a metadata Country enum member." },
    ),
  ),
);

const StateOrProvinceSchema = Schema.Literals([
  "Alberta",
  "British Columbia",
  "Manitoba",
  "New Brunswick",
  "Newfoundland & Labrador",
  "Northwest Territories",
  "Nova Scotia",
  "Nunavut",
  "Ontario",
  "Prince Edward Island",
  "Quebec",
  "Saskatchewan",
  "Yukon",
]);

const AorSchema = Schema.Literals([
  "Affiliate",
  "Alberta West",
  "AREA",
  "Barrie",
  "BC Northern",
  "BCREA",
  "Brandon",
  "Brantford",
  "Brooks(South Central Alberta)",
  "Calgary",
  "Centre du Québec",
  "Chatham Kent",
  "Chilliwack",
  "Cornwall",
  "CREA",
  "Central Lakes",
  "Edmonton",
  "Estrie",
  "Fort McMurray",
  "Fraser Valley",
  "Grande Prairie",
  "Greater Vancouver",
  "Cornerstone",
  "Kingston",
  "Lethbridge",
  "Lloydminster",
  "London and St. Thomas",
  "Mauricie",
  "Medicine Hat",
  "APCIQ",
  "MREA",
  "NBREA",
  "Newfoundland & Labrador",
  "Niagara",
  "North Bay",
  "NSAR",
  "Oakville-Milton",
  "Interior REALTORS®",
  "OREA",
  "Ottawa",
  "Outaouais",
  "PEIA",
  "Powell River",
  "Red Deer (Central Alberta)",
  "Renfrew County",
  "Rideau St.Lawrence",
  "New Brunswick",
  "Sarnia",
  "Saskatchewan",
  "Sault Ste. Marie",
  "Sudbury",
  "OnePoint",
  "Thunder Bay",
  "Timmins",
  "Toronto",
  "Vancouver Island",
  "Victoria",
  "Windsor",
  "Winnipeg",
  "Woodstock-Ingersoll-Tillsonburg",
  "Yellowknife",
  "Yukon",
]);

export const SocialMediaSchema = Schema.Struct({
  SocialMediaKey: Schema.NullOr(Schema.String),
  ResourceRecordKey: Schema.NullOr(Schema.String),
  SocialMediaType: Schema.NullOr(SocialMediaTypeSchema),
  ModificationTimestamp: Schema.DateTimeUtcFromString,
  ResourceName: Schema.NullOr(ResourceNameSchema),
  SocialMediaUrlOrId: Schema.NullOr(Schema.String),
});

export const OfficeSchema = Schema.Struct({
  "@odata.context": Schema.optionalKey(Schema.NullOr(Schema.String)),
  OfficeKey: Schema.String,
  OfficeMlsId: Schema.Union([Schema.String, Schema.Null]),
  OfficeAORKey: Schema.Union([Schema.String, Schema.Null]),
  OfficeNationalAssociationId: Schema.Union([Schema.String, Schema.Null]),
  FranchiseNationalAssociationId: Schema.Union([Schema.String, Schema.Null]),
  OfficeBrokerNationalAssociationId: Schema.Union([Schema.String, Schema.Null]),
  OfficeAddress1: Schema.Union([Schema.String, Schema.Null]),
  OfficeAddress2: Schema.Union([Schema.String, Schema.Null]),
  OfficeCity: Schema.Union([Schema.String, Schema.Null]),
  OfficeFax: Schema.Union([Schema.String, Schema.Null]),
  OfficeName: Schema.Union([Schema.String, Schema.Null]),
  OfficePhone: Schema.Union([Schema.String, Schema.Null]),
  OfficePhoneExt: Schema.Union([Schema.String, Schema.Null]),
  OfficePostalCode: Schema.Union([Schema.String, Schema.Null]),
  Media: Schema.NullOr(MediaSchema),
  OfficeSocialMedia: Schema.Union([
    Schema.Array(SocialMediaSchema),
    Schema.Null,
  ]),
  ModificationTimestamp: Schema.Union([Schema.Null, Schema.DateTimeUtcFromString]),
  OriginalEntryTimestamp: Schema.Union([Schema.Null, Schema.DateTimeUtcFromString]),
  OfficeType: Schema.NullOr(OfficeTypeSchema),
  OfficeStateOrProvince: Schema.NullOr(StateOrProvinceSchema),
  OfficeAOR: Schema.NullOr(AorSchema),
  OfficeStatus: Schema.NullOr(OfficeStatusSchema),
  OfficeCountry: Schema.NullOr(CountrySchema),
});

export { SocialMediaTypeSchema, ResourceNameSchema };

export const OfficeResponseSchema = ODataListEnvelopeSchema(OfficeSchema);

export type Office = typeof OfficeSchema.Type;
export type SocialMedia = typeof SocialMediaSchema.Type;
