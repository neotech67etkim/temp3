export type ProgressNode = {
  id: string;
  parentId: string | null;
  progress: number;
};

export type TreeNode<T> = T & { children: TreeNode<T>[] };

/**
 * 자식이 있는 WorkOrder는 자식들의 계산된 진행률 평균으로 표시된다.
 * leaf(자식 없음) 노드는 저장된 progress 값을 그대로 사용한다.
 */
export function computeProgress<T extends ProgressNode>(
  nodes: T[],
): Map<string, number> {
  const childrenByParent = new Map<string, T[]>();
  for (const node of nodes) {
    if (node.parentId) {
      const list = childrenByParent.get(node.parentId) ?? [];
      list.push(node);
      childrenByParent.set(node.parentId, list);
    }
  }

  const result = new Map<string, number>();

  function resolve(node: T): number {
    const cached = result.get(node.id);
    if (cached !== undefined) return cached;

    const children = childrenByParent.get(node.id);
    const value =
      !children || children.length === 0
        ? node.progress
        : Math.round(
            children.reduce((sum, child) => sum + resolve(child), 0) /
              children.length,
          );

    result.set(node.id, value);
    return value;
  }

  for (const node of nodes) resolve(node);
  return result;
}

export function buildTree<T extends { id: string; parentId: string | null }>(
  nodes: T[],
): TreeNode<T>[] {
  const map = new Map<string, TreeNode<T>>();
  for (const node of nodes) {
    map.set(node.id, { ...node, children: [] });
  }

  const roots: TreeNode<T>[] = [];
  for (const node of nodes) {
    const withChildren = map.get(node.id)!;
    if (node.parentId && map.has(node.parentId)) {
      map.get(node.parentId)!.children.push(withChildren);
    } else {
      roots.push(withChildren);
    }
  }
  return roots;
}
