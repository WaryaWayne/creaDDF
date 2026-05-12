#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const metadataXmlPath = join(root, "src/schema/metadata.xml");
const metadataJsonPath = join(root, "src/schema/metadata.json");

const xml = readFileSync(metadataXmlPath, "utf8");
const json = JSON.parse(readFileSync(metadataJsonPath, "utf8"));

const decodeXmlAttribute = (value) =>
  value
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");

const parseAttributes = (source) =>
  Object.fromEntries(
    [...source.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)].map((attribute) => [
      attribute[1],
      decodeXmlAttribute(attribute[2]),
    ]),
  );

const xmlSchemas = (source) => {
  // This intentionally remains a lightweight parser for the checked-in metadata
  // shape: it expects non-nested Schema/EntityType/ComplexType/EnumType blocks.
  const schemas = [];
  const pattern = /<Schema\b([\s\S]*?)>([\s\S]*?)<\/Schema>/g;
  for (const match of source.matchAll(pattern)) {
    const attributes = parseAttributes(match[1]);
    if (typeof attributes.Namespace === "string") {
      schemas.push({ namespace: attributes.Namespace, body: match[2] });
    }
  }
  return schemas;
};

const xmlTypesByQualifiedName = (source) => {
  const result = new Map();
  const pattern = /<(EntityType|ComplexType)\b([\s\S]*?)>([\s\S]*?)<\/\1>/g;
  for (const schema of xmlSchemas(source)) {
    for (const match of schema.body.matchAll(pattern)) {
      const attributes = parseAttributes(match[2]);
      if (typeof attributes.Name !== "string") continue;
      result.set(`${schema.namespace}.${attributes.Name}`, {
        kind: match[1],
        properties: [...match[3].matchAll(/<Property\b([\s\S]*?)(?:\/>|>)/g)].map(
          (propertyMatch) => {
            const property = parseAttributes(propertyMatch[1]);
            return {
              name: property.Name,
              type: property.Type,
              nullable: property.Nullable ?? "true",
            };
          },
        ),
      });
    }
  }
  return result;
};

const xmlEnumMembersByQualifiedName = (source) => {
  const result = new Map();
  const enumPattern = /<EnumType\b([\s\S]*?)>([\s\S]*?)<\/EnumType>/g;
  for (const schema of xmlSchemas(source)) {
    for (const enumMatch of schema.body.matchAll(enumPattern)) {
      const enumAttributes = parseAttributes(enumMatch[1]);
      if (typeof enumAttributes.Name !== "string") continue;
      result.set(
        `${schema.namespace}.${enumAttributes.Name}`,
        [...enumMatch[2].matchAll(/<Member\b([\s\S]*?)(?:\/>|>)/g)].map(
          (member) => {
            const attributes = parseAttributes(member[1]);
            return attributes.Name;
          },
        ),
      );
    }
  }
  return result;
};

const asArray = (value) => (Array.isArray(value) ? value : value === undefined ? [] : [value]);

const jsonSchemas = asArray(json.Edmx?.DataServices?.Schema);
const jsonTypes = new Map();
const jsonEnums = new Map();

for (const schema of jsonSchemas) {
  const namespace = schema._Namespace;
  if (typeof namespace !== "string") continue;
  for (const type of [...asArray(schema.EntityType), ...asArray(schema.ComplexType)]) {
    if (typeof type?._Name === "string") {
      jsonTypes.set(`${namespace}.${type._Name}`, {
        kind: asArray(schema.EntityType).includes(type) ? "EntityType" : "ComplexType",
        properties: asArray(type.Property),
      });
    }
  }
  for (const enumType of asArray(schema.EnumType)) {
    if (typeof enumType?._Name === "string") {
      jsonEnums.set(
        `${namespace}.${enumType._Name}`,
        asArray(enumType.Member).map((member) => member._Name),
      );
    }
  }
}

const failures = [];
const xmlTypes = xmlTypesByQualifiedName(xml);

for (const [qualifiedName, xmlType] of xmlTypes) {
  const jsonType = jsonTypes.get(qualifiedName);
  if (jsonType === undefined) {
    failures.push(`metadata.json missing type ${qualifiedName}`);
    continue;
  }
  if (jsonType.kind !== xmlType.kind) {
    failures.push(
      `metadata.json ${qualifiedName} kind ${jsonType.kind} does not match XML ${xmlType.kind}`,
    );
  }

  const jsonByName = new Map(
    jsonType.properties.map((property) => [property._Name, property]),
  );
  const xmlByName = new Map(xmlType.properties.map((property) => [property.name, property]));
  for (const xmlProperty of xmlType.properties) {
    const jsonProperty = jsonByName.get(xmlProperty.name);
    if (jsonProperty === undefined) {
      failures.push(`metadata.json ${qualifiedName} missing property ${xmlProperty.name}`);
      continue;
    }
    if (jsonProperty._Type !== xmlProperty.type) {
      failures.push(
        `metadata.json ${qualifiedName}.${xmlProperty.name} type ${jsonProperty._Type} does not match XML ${xmlProperty.type}`,
      );
    }
    const jsonNullable = jsonProperty._Nullable ?? "true";
    if (jsonNullable !== xmlProperty.nullable) {
      failures.push(
        `metadata.json ${qualifiedName}.${xmlProperty.name} nullable ${jsonNullable} does not match XML ${xmlProperty.nullable}`,
      );
    }
  }
  for (const jsonProperty of jsonType.properties) {
    if (!xmlByName.has(jsonProperty._Name)) {
      failures.push(`metadata.xml ${qualifiedName} missing property ${jsonProperty._Name}`);
    }
  }
}

for (const qualifiedName of jsonTypes.keys()) {
  if (!xmlTypes.has(qualifiedName)) failures.push(`metadata.xml missing type ${qualifiedName}`);
}

const xmlEnums = xmlEnumMembersByQualifiedName(xml);
for (const [qualifiedName, xmlMembers] of xmlEnums) {
  const jsonMembers = jsonEnums.get(qualifiedName);
  if (jsonMembers === undefined) {
    failures.push(`metadata.json missing enum ${qualifiedName}`);
    continue;
  }
  const jsonNames = new Set(jsonMembers);
  const xmlNames = new Set(xmlMembers);
  const missing = xmlMembers.filter((member) => !jsonNames.has(member));
  const extra = jsonMembers.filter((member) => !xmlNames.has(member));
  if (missing.length > 0 || extra.length > 0) {
    failures.push(
      `metadata.json enum ${qualifiedName} differs from XML: missing [${missing.join(", ")}], extra [${extra.join(", ")}]`,
    );
  }
}

for (const qualifiedName of jsonEnums.keys()) {
  if (!xmlEnums.has(qualifiedName)) failures.push(`metadata.xml missing enum ${qualifiedName}`);
}

if (failures.length > 0) {
  for (const failure of failures) console.error(failure);
  process.exit(1);
}

console.log("metadata.xml and metadata.json are in parity");
