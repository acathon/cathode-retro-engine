<script lang="ts">
  import { invoke } from '@tauri-apps/api/tauri';
  import { onDestroy } from 'svelte';
  import { project, projectPath } from '../store/project';
  import { scene, scenePath } from '../store/scene';

  let projectTimer: ReturnType<typeof setTimeout> | null = null;
  let sceneTimer: ReturnType<typeof setTimeout> | null = null;
  let readyForProjectAutosave = false;
  let readyForSceneAutosave = false;

  const unsubscribeProject = project.subscribe(($project) => {
    let currentProjectPath: string | null = null;
    projectPath.subscribe((value) => { currentProjectPath = value; })();
    if (!$project || !currentProjectPath) {
      return;
    }

    if (!readyForProjectAutosave) {
      readyForProjectAutosave = true;
      return;
    }

    if (projectTimer) clearTimeout(projectTimer);
    projectTimer = setTimeout(() => {
      void invoke('save_project', { path: currentProjectPath, project: $project });
    }, 400);
  });

  const unsubscribeScene = scene.subscribe(($scene) => {
    let currentScenePath: string | null = null;
    scenePath.subscribe((value) => { currentScenePath = value; })();
    if (!$scene || !currentScenePath) {
      return;
    }

    if (!readyForSceneAutosave) {
      readyForSceneAutosave = true;
      return;
    }

    if (sceneTimer) clearTimeout(sceneTimer);
    sceneTimer = setTimeout(() => {
      void invoke('write_scene', {
        path: currentScenePath,
        json: JSON.stringify($scene, null, 2),
      });
    }, 250);
  });

  onDestroy(() => {
    unsubscribeProject();
    unsubscribeScene();
    if (projectTimer) clearTimeout(projectTimer);
    if (sceneTimer) clearTimeout(sceneTimer);
  });
</script>