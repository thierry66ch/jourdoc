export default function WorkspaceSelector({ workspaces, appSlug }) {
  function handleSelect(e, wsId) {
    e.stopPropagation()
    window.location.href = `/${appSlug}/${wsId}`
  }

  return (
    <ul className="workspace-selector" onClick={(e) => e.stopPropagation()}>
      {workspaces.map((ws) => (
        <li key={ws.id} onClick={(e) => handleSelect(e, ws.id)}>
          {ws.name}
        </li>
      ))}
    </ul>
  )
}
