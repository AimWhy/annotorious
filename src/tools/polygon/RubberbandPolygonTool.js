import RubberbandPolygon from './RubberbandPolygon';
import EditablePolygon from './EditablePolygon';
import Tool from '../Tool';

/**
 * A rubberband selector for rectangle fragments.
 */
export default class RubberbandPolygonTool extends Tool {

  constructor(g, config, env) {
    super(g, config, env);

    this._isDrawing = false;
  }

  startDrawing = (x, y) => {
    this._isDrawing = true;

    this.attachListeners({
      mouseMove: this.onMouseMove,
      mouseUp: this.onMouseUp,
      dblClick: this.onDblClick
    });
    
    this.rubberband = new RubberbandPolygon([ x, y ], this.g, this.env);
  }

  stop = () => {
    this.detachListeners();
    
    this._isDrawing = false;

    if (this.rubberband) {
      this.rubberband.destroy();
      this.rubberband = null;
    }
  }

  onMouseMove = (x, y) =>
    this.rubberband.dragTo([ x, y ]);

  onMouseUp = (x, y) => {
    if (this.rubberband.isCollapsed) {
      this.emit('cancel', evt);
      this.stop();
    } else {
      this.rubberband.addPoint([ x, y ]);
    }
  }

  onDblClick = (x, y) => {
    this.detachListeners();

    this._isDrawing = false;

    this.rubberband.addPoint([ x, y ]);

    const shape = this.rubberband.element;
    shape.annotation = this.rubberband.toSelection();
    this.emit('complete', shape);

    this.stop();
  }

  get isDrawing() {
    return this._isDrawing;
  }
  
  createEditableShape = annotation =>
    new EditablePolygon(annotation, this.g, this.config, this.env);

}

RubberbandPolygonTool.identifier = 'polygon';

RubberbandPolygonTool.supports = annotation => {
  const selector = annotation.selector('SvgSelector');
  if (selector)
    return selector.value?.match(/^<svg.*<polygon/g);
}