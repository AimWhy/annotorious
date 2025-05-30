import { v4 as uuidv4 } from 'uuid';
import type { Annotation } from '../model';
import { diffAnnotations } from '../utils';
import { Origin, shouldNotify, type Update, type ChangeSet } from './StoreObserver';
import type { StoreObserver, StoreChangeEvent, StoreObserveOptions } from './StoreObserver';

// Shorthand
type AnnotationBodyIdentifier = { id: string, annotation: string }; 

const sanitize = <T extends Annotation>(a: Partial<T>): T => {
  const id = a.id === undefined ? uuidv4() : a.id;

  return {
    ...a,
    id,
    bodies: a.bodies === undefined ? [] : a.bodies.map(b => ({
      ...b,
      annotation: id 
    })),
    target: {
      ...a.target,
      annotation: id
    }
  } as T;
}

export type Store<T extends Annotation> = ReturnType<typeof createStore<T>>;

const isAnnotation = <T extends Annotation>(arg: any): arg is T => arg.id !== undefined;

export const createStore = <T extends Annotation>() => {

  const annotationIndex = new Map<string, T>();

  const bodyIndex = new Map<string, string>();

  const observers: StoreObserver<T>[] = [];

  const observe = (onChange: { (event: StoreChangeEvent<T>): void }, options: StoreObserveOptions = {}) => {
    observers.push({ onChange, options });
  }

  const unobserve = (onChange: { (event: StoreChangeEvent<T>): void }) => {
    const idx = observers.findIndex(observer => observer.onChange == onChange);
    if (idx > -1)
      observers.splice(idx, 1);
  }

  const emit = (origin: Origin, changes: ChangeSet<T>) => {
    const event: StoreChangeEvent<T> = {
      origin,
      changes: {
        created: changes.created || [],
        updated: changes.updated || [],
        deleted: changes.deleted || []
      },
      state: [...annotationIndex.values()]
    };

    observers.forEach(observer => {
      if (shouldNotify(observer, event))
        observer.onChange(event);
    });
  }

  const addAnnotation = (annotation: Partial<T>, origin = Origin.LOCAL) => {
    const existing = annotation.id && annotationIndex.get(annotation.id);

    if (existing) {
      throw Error(`Cannot add annotation ${annotation.id} - exists already`);
    } else {
      const sanitized = sanitize(annotation);

      annotationIndex.set(sanitized.id, sanitized);
      sanitized.bodies.forEach(b => bodyIndex.set(b.id, sanitized.id));
      emit(origin, { created: [sanitized] });
    }
  }

  const updateOneAnnotation = (arg1: string | Partial<T>, arg2?: Partial<T> | Origin) => {
    const updated: T = typeof arg1 === 'string' ? sanitize(arg2 as Partial<T>) : sanitize(arg1);

    const oldId: string | undefined = typeof arg1 === 'string' ? arg1 : arg1.id;
    const oldValue = oldId && annotationIndex.get(oldId);

    if (oldValue) {
      const update: Update<T> = diffAnnotations(oldValue, updated);

      if (oldId === updated.id) {
        annotationIndex.set(oldId, updated);
      } else {
        annotationIndex.delete(oldId);
        annotationIndex.set(updated.id, updated);
      }

      oldValue.bodies.forEach(b => bodyIndex.delete(b.id));
      updated.bodies.forEach(b => bodyIndex.set(b.id, updated.id));

      return update;
    } else {
      console.warn(`Cannot update annotation ${oldId} - does not exist`);
    }
  }
  
  const updateAnnotation = (arg1: string | T, arg2: T | Origin = Origin.LOCAL, arg3 = Origin.LOCAL) => {
    const origin: Origin = isAnnotation(arg2) ? arg3 : arg2;

    const update = updateOneAnnotation(arg1, arg2);
    if (update)
      emit(origin, { updated: [update] })
  }

  const upsertAnnotation = (annotation: T, origin = Origin.LOCAL) => {
    const exists = Boolean(annotationIndex.get(annotation.id));
    if (exists) {
      updateAnnotation(annotation, origin);
    } else {
      addAnnotation(annotation, origin);
    }
  }

  const bulkUpdateAnnotations = (annotations: T[], origin = Origin.LOCAL) => {
    const updated = annotations.reduce((updated, annotation) => {
      const u = updateOneAnnotation(annotation);
      return u ? [...updated, u] : updated;
    }, [] as Update<T>[]);

    if (updated.length > 0)
      emit(origin, { updated });
  }

  const bulkUpsertAnnotations = (annotations: Partial<T>[], origin = Origin.LOCAL) => {
    const sanitized = annotations.map(sanitize);

    const { toAdd, toUpdate } = sanitized.reduce<{ toAdd: T[], toUpdate: T[] }>((agg, annotation) => {
      const exists = Boolean(annotationIndex.get(annotation.id));
      if (exists) {
        return {...agg, toUpdate: [...agg.toUpdate, annotation]};
      } else {
        return {...agg, toAdd: [...agg.toAdd, annotation]}
      }
    }, { toAdd: [], toUpdate: [] });

    const updated = toUpdate.map(a => updateOneAnnotation(a, origin)!).filter(Boolean);

    toAdd.forEach(annotation => {
      annotationIndex.set(annotation.id, annotation);
      annotation.bodies.forEach(b => bodyIndex.set(b.id, annotation.id));
    });

    emit(origin, { created: toAdd, updated });
  }

  const addBody = (body: T['bodies'][number], origin = Origin.LOCAL) => {
    const oldValue = annotationIndex.get(body.annotation);
    if (oldValue) {
      const newValue = { 
        ...oldValue,
        bodies: [ ...oldValue.bodies, body ]
      };

      annotationIndex.set(oldValue.id, newValue);

      bodyIndex.set(body.id, newValue.id);

      const update: Update<T> = {
        oldValue, newValue, bodiesCreated: [ body ]
      };

      emit(origin, { updated: [update] });
    } else {
      console.warn(`Attempt to add body to missing annotation: ${body.annotation}`);
    }
  }

  const all = () => [...annotationIndex.values()];

  const clear = (origin = Origin.LOCAL) => { 
    const all = [...annotationIndex.values()];

    annotationIndex.clear();
    bodyIndex.clear();

    emit(origin, { deleted: all });
  }

  const bulkAddAnnotations = (annotations: Partial<T>[], replace = true, origin = Origin.LOCAL) => {
    const sanitized = annotations.map(sanitize);

    if (replace) {
      // Delete existing first
      const deleted = [...annotationIndex.values()];
      annotationIndex.clear();
      bodyIndex.clear();

      sanitized.forEach(annotation => {
        annotationIndex.set(annotation.id, annotation);
        annotation.bodies.forEach(b => bodyIndex.set(b.id, annotation.id));
      });

      emit(origin, { created: sanitized, deleted });
    } else {
      // Don't allow overwriting of existing annotations
      const existing = annotations.reduce((all, next) => {
        const existing = next.id && annotationIndex.get(next.id);
        return existing ? [...all, existing ] : all;
      }, [] as T[]);

      if (existing.length > 0)
        throw Error(`Bulk insert would overwrite the following annotations: ${existing.map(a => a.id).join(', ')}`);

      sanitized.forEach(annotation => {
        annotationIndex.set(annotation.id, annotation);
        annotation.bodies.forEach(b => bodyIndex.set(b.id, annotation.id));
      });

      emit(origin, { created: sanitized });
    }
  }

  const deleteOneAnnotation = (annotationOrId: T | string) => {
    const id = typeof annotationOrId === 'string' ? annotationOrId : annotationOrId.id;

    const existing = annotationIndex.get(id);
    if (existing) {
      annotationIndex.delete(id);
      existing.bodies.forEach(b => bodyIndex.delete(b.id));
      return existing;
    } else {
      console.warn(`Attempt to delete missing annotation: ${id}`);
    }
  }

  const deleteAnnotation = (annotationOrId: T | string, origin = Origin.LOCAL) => {
    const deleted = deleteOneAnnotation(annotationOrId);
    if (deleted)
      emit(origin, { deleted: [ deleted  ]});
  }

  const bulkDeleteAnnotations = (annotationsOrIds: (T | string)[], origin = Origin.LOCAL) => {
    const deleted = annotationsOrIds.reduce((deleted, arg) => {
      const existing = deleteOneAnnotation(arg);
      return existing ? [...deleted, existing] : deleted;
    }, [] as T[]);

    if (deleted.length > 0)
      emit(origin, { deleted });
  }

  const deleteOneBody = (body: AnnotationBodyIdentifier) => {
    const oldAnnotation = annotationIndex.get(body.annotation);

    if (oldAnnotation) {
      const oldBody = oldAnnotation.bodies.find(b => b.id === body.id);

      if (oldBody) {
        bodyIndex.delete(oldBody.id);

        const newAnnotation = {
          ...oldAnnotation,
          bodies: oldAnnotation.bodies.filter(b => b.id !== body.id)
        };

        annotationIndex.set(oldAnnotation.id, newAnnotation);

        const update: Update<T> = {
          oldValue: oldAnnotation, newValue: newAnnotation, bodiesDeleted: [oldBody]
        };

        return update;
      } else {
        console.warn(`Attempt to delete missing body ${body.id} from annotation ${body.annotation}`);
      }
    } else {
      console.warn(`Attempt to delete body from missing annotation ${body.annotation}`);
    }
  }
 
  const deleteBody = (body: AnnotationBodyIdentifier, origin = Origin.LOCAL) => {
    const updated = deleteOneBody(body);
    if (updated)
      emit(origin, { updated: [ updated  ]});
  }

  const bulkDeleteBodies = (bodies: AnnotationBodyIdentifier[], origin = Origin.LOCAL) => {
    const updated = bodies
      .map(b => deleteOneBody(b)!)
      .filter(Boolean);

    if (updated.length > 0)
      emit(origin, { updated });
  }

  const getAnnotation = (id: string): T | undefined => {
    const a = annotationIndex.get(id);
    return a ? {...a} : undefined;
  }

  const getBody = (id: string): T['bodies'][number] | undefined => {
    const annotationId = bodyIndex.get(id);
    if (annotationId) {
      const annotation = getAnnotation(annotationId);
      const body = annotation!.bodies.find(b => b.id === id);
      if (body) {
        return body;
      } else {
        console.error(`Store integrity error: body ${id} in index, but not in annotation`);
      }
    } else {
      console.warn(`Attempt to retrieve missing body: ${id}`);
    }
  }

  const updateOneBody = (oldBodyId: AnnotationBodyIdentifier, newBody: T['bodies'][number]) => {
    if (oldBodyId.annotation !== newBody.annotation)
      throw 'Annotation integrity violation: annotation ID must be the same when updating bodies';

    const oldAnnotation = annotationIndex.get(oldBodyId.annotation);
    if (oldAnnotation) {
      const oldBody = oldAnnotation.bodies.find(b => b.id === oldBodyId.id)!;

      const newAnnotation = { 
        ...oldAnnotation,
        bodies: oldAnnotation.bodies.map(b => b.id === oldBody.id ? newBody : b)
      };

      annotationIndex.set(oldAnnotation.id, newAnnotation);

      if (oldBody.id !== newBody.id) {
        bodyIndex.delete(oldBody.id);
        bodyIndex.set(newBody.id, newAnnotation.id);
      }

      return {
        oldValue: oldAnnotation, 
        newValue: newAnnotation,
        bodiesUpdated: [{ oldBody, newBody }]
      }
    } else {
      console.warn(`Attempt to add body to missing annotation ${oldBodyId.annotation}`);
    }
  }

  const updateBody = (oldBodyId: AnnotationBodyIdentifier, newBody: T['bodies'][number], origin = Origin.LOCAL) => {
    const update = updateOneBody(oldBodyId, newBody);
    if (update)
      emit(origin, { updated: [ update ]} );
  }

  const bulkUpdateBodies = (bodies: Array<T['bodies'][number]>, origin = Origin.LOCAL) => {
    const updated = bodies
      .map(b => updateOneBody({ id: b.id, annotation: b.annotation }, b)!)
      .filter(Boolean);

    emit(origin, { updated });
  }

  const updateOneTarget = (target: T['target']): Update<T> | undefined => {
    const oldValue = annotationIndex.get(target.annotation);
    
    if (oldValue) {
      const newValue = { 
        ...oldValue, 
        target: {
          ...oldValue.target,
          ...target 
        }
      };

      annotationIndex.set(oldValue.id, newValue);

      return {
        oldValue, newValue, targetUpdated: { 
          oldTarget: oldValue.target,
          newTarget: target
        }
      };
    } else {
      console.warn(`Attempt to update target on missing annotation: ${target.annotation}`);
    }
  }

  const updateTarget = (target: T['target'], origin = Origin.LOCAL) => {
    const update = updateOneTarget(target);
    if (update)
      emit(origin, { updated: [ update ]} );
  }

  const bulkUpdateTargets = (targets: Array<T['target']>, origin = Origin.LOCAL) => {
    const updated = 
      targets.map(t => updateOneTarget(t)!).filter(Boolean);
    if (updated.length > 0)
      emit(origin, { updated });
  }

	return {
    addAnnotation,
    addBody,
    all,
    bulkAddAnnotations,
    bulkDeleteAnnotations,
    bulkDeleteBodies,
    bulkUpdateAnnotations,
    bulkUpdateBodies,
    bulkUpdateTargets,
    bulkUpsertAnnotations,
    clear,
    deleteAnnotation,
    deleteBody,
    getAnnotation,
    getBody,
    observe,
    unobserve,
    updateAnnotation,
    updateBody,
    updateTarget,
    upsertAnnotation
	};

}
