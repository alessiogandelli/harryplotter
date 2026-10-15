import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { useFigureStore } from '../store/figureStore';
import type { Project, Version } from '../types/api';

export function VersionsPanel() {
  const { t } = useTranslation();
  const spec = useFigureStore((state) => state.spec);
  const projectId = useFigureStore((state) => state.projectId);
  const setProjectId = useFigureStore((state) => state.setProjectId);
  const setDataset = useFigureStore((state) => state.setDataset);
  const restore = useFigureStore((state) => state.restore);

  const [projects, setProjects] = useState<Project[]>([]);
  const [versions, setVersions] = useState<Version[]>([]);
  const [projectName, setProjectName] = useState('');
  const [versionName, setVersionName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

  useEffect(() => {
    api
      .listProjects()
      .then(setProjects)
      .catch(() => setProjects([]));
  }, []);

  useEffect(() => {
    if (!projectId) {
      setVersions([]);
      return;
    }
    api
      .listVersions(projectId)
      .then(setVersions)
      .catch(() => setVersions([]));
  }, [projectId]);

  const createProject = async () => {
    if (!projectName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const project = await api.createProject(projectName.trim());
      setProjects((current) => [...current, project]);
      setProjectId(project.id);
      setProjectName('');
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  const saveVersion = async () => {
    if (!projectId || !versionName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const created = await api.createVersion(projectId, versionName.trim(), spec);
      setVersions((current) => [...current, created]);
      setVersionName('');
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  const restoreVersion = async (version: Version) => {
    setError(null);
    restore(version.spec);
    if (version.spec.dataset.id) {
      try {
        const dataset = await api.getDataset(version.spec.dataset.id);
        setDataset(dataset);
      } catch {
        /* the dataset may no longer exist; the spec is still restored */
      }
    }
  };

  const duplicateVersion = async (version: Version) => {
    setBusy(true);
    setError(null);
    try {
      const copy = await api.duplicateVersion(version.id);
      setVersions((current) => [...current, copy]);
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel versions-panel">
      <h2>{t('versions.title')}</h2>

      <div className="row">
        <input
          className="input"
          type="text"
          placeholder={t('versions.projectName')}
          value={projectName}
          onChange={(event) => setProjectName(event.target.value)}
        />
        <button type="button" className="secondary" onClick={createProject} disabled={busy}>
          {t('versions.createProject')}
        </button>
      </div>

      <label className="field">
        <span className="field-label">{t('versions.projectLabel')}</span>
        <select
          className="input"
          value={projectId ?? ''}
          onChange={(event) => setProjectId(event.target.value || null)}
        >
          <option value="">{t('versions.selectProject')}</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </label>

      {projectId ? (
        <>
          <div className="row">
            <input
              className="input"
              type="text"
              placeholder={t('versions.versionName')}
              value={versionName}
              onChange={(event) => setVersionName(event.target.value)}
            />
            <button type="button" className="secondary" onClick={saveVersion} disabled={busy}>
              {t('versions.saveVersion')}
            </button>
          </div>

          {versions.length === 0 ? (
            <p className="muted">{t('versions.noVersions')}</p>
          ) : (
            <ul className="version-list">
              {versions.map((version) => (
                <li key={version.id} className="version-item">
                  <div>
                    <strong>{version.name}</strong>
                    <span className="muted"> · {new Date(version.createdAt).toLocaleString()}</span>
                  </div>
                  <div className="version-actions">
                    <button type="button" className="link" onClick={() => restoreVersion(version)}>
                      {t('versions.restore')}
                    </button>
                    <button
                      type="button"
                      className="link"
                      onClick={() => duplicateVersion(version)}
                      disabled={busy}
                    >
                      {t('versions.duplicate')}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <p className="muted">{t('versions.noProject')}</p>
      )}

      {error && <p className="error">{error}</p>}
    </section>
  );
}
