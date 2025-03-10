import type { Bounds, Shape, ShapeType } from './Shape';

export interface ShapeUtil<T extends Shape> {

  area: (shape: T) => number;

  intersects: (shape: T, x: number, y: number) => boolean;

}

const Utils: { [key: string]: ShapeUtil<any> } = {};

/**
 * Registers a new ShapeUtil for a given shape type.
 * @param type the shape type
 * @param util the ShapeUtil implementation for this shape type
 */
export const registerShapeUtil = (type: ShapeType | string, util: ShapeUtil<any>) =>
  (Utils[type] = util);

/**
 * Computes the area of the given shape. Delegates to the corresponding ShapeUtil.
 * @param shape the shape
 */
export const computeArea = (shape: Shape) => Utils[shape.type].area(shape);

/**
 * Tests if the given shape intersects the given point. Delegates to
 * the corresponding ShapeUtil.
 * @param shape the shape
 * @param x point x coord
 * @param y point y coord
 * @returns true if shape and point intersect
 */
export const intersects = (shape: Shape, x: number, y: number): boolean =>
  Utils[shape.type].intersects(shape, x, y);

/**
 * Computes Bounds from a given list of points.
 * @param points the points
 * @returns the Bounds
 */
export const boundsFromPoints = (points: Array<[number, number]>): Bounds => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  points.forEach(([x, y]) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  });

  return { minX, minY, maxX, maxY };
}

export const computePolygonArea = (points: [number, number][]) => {
  let area = 0;
  let j = points.length - 1;

  for (let i = 0; i < points.length; i++) {
    area += (points[j][0] + points[i][0]) * (points[j][1] - points[i][1]);
    j = i;
  }

  return Math.abs(0.5 * area);
}

export const isPointInPolygon = (points: [number, number][], x: number, y: number): boolean => {
  // Based on https://wrf.ecse.rpi.edu/Research/Short_Notes/pnpoly.html/pnpoly.html
  let inside = false;

  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i][0],
      yi = points[i][1];
    const xj = points[j][0],
      yj = points[j][1];

    const intersect = yi > y != yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;

    if (intersect) inside = !inside;
  }

  return inside;
}

