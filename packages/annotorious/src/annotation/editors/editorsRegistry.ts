import type { SvelteComponent } from 'svelte';
import { ShapeType, type Shape } from '../../model';
import { MultiPolygonEditor } from './multipolygon';
import { PolygonEditor } from './polygon';
import { RectangleEditor } from './rectangle';

const REGISTERED = new Map<ShapeType, typeof SvelteComponent>([
  [ShapeType.RECTANGLE, RectangleEditor as typeof SvelteComponent],
  [ShapeType.POLYGON, PolygonEditor as typeof SvelteComponent],
  [ShapeType.MULTIPOLYGON, MultiPolygonEditor as typeof SvelteComponent]
]);

export const getEditor = (shape: Shape) => REGISTERED.get(shape.type);

export const registerEditor = (shapeType: ShapeType, editor: typeof SvelteComponent) =>
  REGISTERED.set(shapeType, editor);