export interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  labels: LinearLabel[];
}

export interface LinearLabel {
  id: string;
  name: string;
  parent?: { id: string; name: string } | null;
}