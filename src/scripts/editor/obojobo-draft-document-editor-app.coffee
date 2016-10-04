"use strict";

# setup toolbar
console.log 'BOUT TO LOAD TOOLBAR!', window.OBO
require './toolbar'

loadModule = require '../loadmodule'

EditorApp = window.Editor.components.EditorApp

moduleId = decodeURIComponent(document.location.hash).substr(1)

loadModule moduleId, (items) ->
	ReactDOM.render `<EditorApp
						module={items.module}
						chunks={items.chunks}
						insertItems={items.insertItems}
						toolbarItems={items.toolbarItems}
					/>`, document.getElementById('editor-app')