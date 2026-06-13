import type {
  CatalogItem,
  CustomObjectList,
  Edge,
  MapSettings,
  Preset,
  Zone
} from "../types/editor";
import type { RmgTemplate, RmgContentListEntry, RmgOrientation, RmgBorder } from "../types/rmg";
import { generateTemplate } from "./jsonGenerator";
import {
  createJsonDocument,
  safeFilenameBase,
  type JsonDocument
} from "./jsonDocument";

export const VISUAL_DESIGN_VERSION = 3;

export interface DesignVariant {
  id: string;
  zones: Zone[];
  edges: Edge[];
  fixedOrientation: boolean;
  orientationAnchor: string;
  preserveLayout: boolean;
  originalOrientation?: RmgOrientation;
  borderWaterWidth: number;
  borderCornerRadius: number;
  originalBorder?: RmgBorder;
}

export interface TemplateDocumentSource {
  settings: MapSettings;
  zones: Zone[];
  edges: Edge[];
  objectLibrary: CatalogItem[];
  artifactLists: Record<string, RmgContentListEntry[]>;
  presets: Record<string, Preset>;
  customObjectLists: Record<string, CustomObjectList>;
  extraVariants?: DesignVariant[];
}

export interface VisualDesignDocumentSource {
  settings: MapSettings;
  zones: Zone[];
  edges: Edge[];
  presets: Record<string, Preset>;
  customObjectLists: Record<string, CustomObjectList>;
  variants?: DesignVariant[];
  activeVariantId?: string;
}

export interface VisualDesignDocument {
  version: typeof VISUAL_DESIGN_VERSION;
  settings: MapSettings;
  zones: Zone[];
  edges: Edge[];
  presets: Record<string, Preset>;
  customObjectLists: Record<string, CustomObjectList>;
  variants?: DesignVariant[];
  activeVariantId?: string;
}

export function createTemplateDocument(
  source: TemplateDocumentSource
): JsonDocument<RmgTemplate> {
  const template = generateTemplate(
    source.settings,
    source.zones,
    source.edges,
    source.objectLibrary,
    source.artifactLists,
    source.presets,
    source.customObjectLists,
    source.extraVariants
  );
  const filenameBase = safeFilenameBase(source.settings.name, "template");

  return createJsonDocument(`${filenameBase}.rmg.json`, template);
}

export function createVisualDesignDocument(
  source: VisualDesignDocumentSource
): JsonDocument<VisualDesignDocument> {
  const design: VisualDesignDocument = {
    version: VISUAL_DESIGN_VERSION,
    settings: source.settings,
    zones: source.zones,
    edges: source.edges,
    presets: source.presets,
    customObjectLists: source.customObjectLists,
    variants: source.variants,
    activeVariantId: source.activeVariantId
  };
  const filenameBase = safeFilenameBase(source.settings.name, "template");

  return createJsonDocument(`${filenameBase}.visual-design.json`, design);
}
