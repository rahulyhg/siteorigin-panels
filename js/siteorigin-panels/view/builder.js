var panels = window.panels, $ = jQuery;

module.exports = Backbone.View.extend( {

	// Config options
	config: {},

	template: _.template( panels.helpers.utils.processTemplate( $( '#siteorigin-panels-builder' ).html() ) ),
	dialogs: {},
	rowsSortable: null,
	dataField: false,
	currentData: '',

	attachedToEditor: false,
	attachedVisible: false,
	liveEditor: undefined,
	menu: false,

	activeCell: null,

	events: {
		'click .so-tool-button.so-widget-add': 'displayAddWidgetDialog',
		'click .so-tool-button.so-row-add': 'displayAddRowDialog',
		'click .so-tool-button.so-prebuilt-add': 'displayAddPrebuiltDialog',
		'click .so-tool-button.so-history': 'displayHistoryDialog',
		'click .so-tool-button.so-live-editor': 'displayLiveEditor',
		'click .so-learn-wrapper .show-tutorials': 'loadTutorials'
	},

	/* A row collection */
	rows: null,

	/**
	 * Initialize the builder
	 */
	initialize: function ( options ) {
		var builder = this;

		this.config = _.extend( {
			loadLiveEditor: false,
			builderSupports : {}
		}, options.config);

		// These are the actions that a user can perform in the builder
		this.config.builderSupports = _.extend( {
			addRow: true,
			editRow: true,
			deleteRow: true,
			moveRow: true,
			addWidget: true,
			editWidget: true,
			deleteWidget: true,
			moveWidget: true,
			prebuilt: true,
			history: true,
			liveEditor: true,
			revertToEditor: true
		}, this.config.builderSupports );

		// Automatically load the live editor as soon as it's ready
		if( options.config.loadLiveEditor ) {
			this.on( 'builder_live_editor_added', function(){
				this.displayLiveEditor();
			} );
			}

		// Now lets create all the dialog boxes that the main builder interface uses
		this.dialogs = {
			widgets: new panels.dialog.widgets(),
			row: new panels.dialog.row(),
			prebuilt: new panels.dialog.prebuilt()
		};

		// Set the builder for each dialog and render it.
		_.each( this.dialogs, function ( p, i, d ) {
			d[i].setBuilder( builder );
		} );

		this.dialogs.row.setRowDialogType( 'create' );

		// This handles a new row being added to the collection - we'll display it in the interface
		this.model.get('rows').on( 'add', this.onAddRow, this );

		// Reflow the entire builder when ever the
		$( window ).resize( function ( e ) {
			if ( e.target === window ) {
				builder.trigger( 'builder_resize' );
			}
		} );

		// When the data changes in the model, store it in the field
		this.model.on( 'change:data load_panels_data', this.storeModelData, this );

		// Handle a content change
		this.on( 'content_change', this.handleContentChange, this );
		this.on( 'display_builder', this.handleDisplayBuilder, this );
		this.on( 'hide_builder', this.handleHideBuilder, this );
		this.on( 'builder_rendered builder_resize', this.handleBuilderSizing, this );
		this.model.on( 'change:data load_panels_data', this.toggleWelcomeDisplay, this );

		this.on( 'display_builder', this.wrapEditorExpandAdjust, this );

		// Create the context menu for this builder
		this.menu = new panels.utils.menu( {} );
		this.menu.on( 'activate_context', this.activateContextMenu, this );

		if( this.config.loadOnAttach ) {
			this.on( 'builder_attached_to_editor', function(){
				this.displayAttachedBuilder( { confirm: false } );
			}, this );
		}


		return this;
	},

	/**
	 * Render the builder interface.
	 *
	 * @return {panels.view.builder}
	 */
	render: function () {
		// this.$el.html( this.template() );
		this.setElement( this.template() );
		this.$el
			.attr( 'id', 'siteorigin-panels-builder-' + this.cid )
			.addClass( 'so-builder-container' );

		if( panelsOptions.tutorials_enabled ) {
			this.loadTutorials();
		}

		this.trigger( 'builder_rendered' );

		return this;
	},

	/**
	 * Attach the builder to the given container
	 *
	 * @param container
	 * @returns {panels.view.builder}
	 */
	attach: function ( options ) {

		options = _.extend( {
			container: false,
			dialog: false
		}, options );

		if ( options.dialog ) {
			// We're going to add this to a dialog
			this.dialog = new panels.dialog.builder();
			this.dialog.builder = this;
		} else {
			// Attach this in the standard way
			this.$el.appendTo( options.container );
			this.metabox = options.container.closest( '.postbox' );
			this.initSortable();
			this.trigger( 'attached_to_container', options.container );
		}

		this.trigger( 'builder_attached' );

		// Add support for components we have

		if( this.supports( 'liveEditor' ) ) {
			this.addLiveEditor();
		}
		if( this.supports( 'history' ) ) {
			this.addHistoryBrowser();
		}

		// Hide toolbar buttons we don't support
		var toolbar = this.$('.so-builder-toolbar');
		if( ! this.supports( 'addWidget' ) ) {
			toolbar.find('.so-widget-add' ).hide();
		}
		if( ! this.supports( 'addRow' ) ) {
			toolbar.find('.so-row-add' ).hide();
		}
		if( ! this.supports( 'prebuilt' ) ) {
			toolbar.find('.so-prebuilt-add' ).hide();
		}

		return this;
	},

	/**
	 * This will move the Page Builder meta box into the editor if we're in the post/page edit interface.
	 *
	 * @returns {panels.view.builder}
	 */
	attachToEditor: function () {
		if ( this.config.editorType !== 'tinyMCE' ) {
			return this;
		}

		this.attachedToEditor = true;
		var metabox = this.metabox;
		var thisView = this;

		// Handle switching between the page builder and other tabs
		$( '#wp-content-wrap .wp-editor-tabs' )
			.find( '.wp-switch-editor' )
			.click( function ( e ) {
				e.preventDefault();
				$( '#wp-content-editor-container' ).show();

				// metabox.hide();
				$( '#wp-content-wrap' ).removeClass( 'panels-active' );
				$( '#content-resize-handle' ).show();

				// Make sure the word count is visible
				thisView.trigger( 'hide_builder' );
			} ).end()
			.append(
				$( '<a id="content-panels" class="hide-if-no-js wp-switch-editor switch-panels">' + metabox.find( '.hndle span' ).html() + '</a>' )
					.click( function ( e ) {
						if ( thisView.displayAttachedBuilder( { confirm: true } ) ) {
							e.preventDefault();
						}
					} )
			);

		// Switch back to the standard editor
		if( this.supports( 'revertToEditor' ) ) {
			metabox.find( '.so-switch-to-standard' ).click( function ( e ) {
				e.preventDefault();

				if ( ! confirm( panelsOptions.loc.confirm_stop_builder ) ) {
					return;
				}

				// User is switching to the standard visual editor
				thisView.addHistoryEntry( 'back_to_editor' );
				thisView.model.loadPanelsData( false );

				// Switch back to the standard editor
				$( '#wp-content-wrap' ).show();
				metabox.hide();

				// Resize to trigger reflow of WordPress editor stuff
				$( window ).resize();

                thisView.attachedVisible = false;
				thisView.trigger( 'hide_builder' );
			} ).show();
		}

		// Move the panels box into a tab of the content editor
		metabox.insertAfter( '#wp-content-wrap' ).hide().addClass( 'attached-to-editor' );

		// Switch to the Page Builder interface as soon as we load the page if there are widgets
		var data = this.model.get( 'data' );
		if ( ! _.isEmpty( data.widgets ) || ! _.isEmpty( data.grids ) ) {
			this.displayAttachedBuilder( { confirm: false } );
		}

		// We will also make this sticky if its attached to an editor.
		var stickToolbar = function () {
			var toolbar = thisView.$( '.so-builder-toolbar' );

			if ( thisView.$el.hasClass( 'so-display-narrow' ) ) {
				// In this case, we don't want to stick the toolbar.
				toolbar.css( {
					top: 0,
					left: 0,
					width: '100%',
					position: 'absolute'
				} );
				thisView.$el.css( 'padding-top', toolbar.outerHeight() );
				return;
			}

			var newTop = $( window ).scrollTop() - thisView.$el.offset().top;

			if ( $( '#wpadminbar' ).css( 'position' ) === 'fixed' ) {
				newTop += $( '#wpadminbar' ).outerHeight();
			}

			var limits = {
				top: 0,
				bottom: thisView.$el.outerHeight() - toolbar.outerHeight() + 20
			};

			if ( newTop > limits.top && newTop < limits.bottom ) {
				if ( toolbar.css( 'position' ) !== 'fixed' ) {
					// The toolbar needs to stick to the top, over the interface
					toolbar.css( {
						top: $( '#wpadminbar' ).outerHeight(),
						left: thisView.$el.offset().left,
						width: thisView.$el.outerWidth(),
						position: 'fixed'
					} );
				}
			} else {
				// The toolbar needs to be at the top or bottom of the interface
				toolbar.css( {
					top: Math.min( Math.max( newTop, 0 ), thisView.$el.outerHeight() - toolbar.outerHeight() + 20 ),
					left: 0,
					width: '100%',
					position: 'absolute'
				} );
			}

			thisView.$el.css( 'padding-top', toolbar.outerHeight() );
		};

		this.on( 'builder_resize', stickToolbar, this );
		$( document ).scroll( stickToolbar );
		stickToolbar();

		this.trigger('builder_attached_to_editor');

		return this;
	},

	/**
	 * Display the builder interface when attached to a WordPress editor
	 */
	displayAttachedBuilder: function( options ){
		options = _.extend( {
			confirm: true
		}, options );

		// Switch to the Page Builder interface

		if( options.confirm ) {
			var editor = typeof tinyMCE !== 'undefined' ? tinyMCE.get( 'content' ) : false;
			var editorContent = ( editor && _.isFunction( editor.getContent ) ) ? editor.getContent() : $( 'textarea#content' ).val();

			if ( editorContent !== '' && ! confirm( panelsOptions.loc.confirm_use_builder ) ) {
				return false;
			}
		}

		// Hide the standard content editor
		$( '#wp-content-wrap' ).hide();

		// Show page builder and the inside div
		this.metabox.show().find( '> .inside' ).show();

		// Triggers full refresh
		$( window ).resize();
		$( document ).scroll();

		// Make sure the word count is visible
		this.attachedVisible = true;
		this.trigger( 'display_builder' );

		return true;
	},

	/**
	 * Initialize the row sortables
	 */
	initSortable: function () {
		if( ! this.supports( 'moveRow' ) ) {
			return this;
		}

		// Create the sortable for the rows
		var builderView = this;

		this.rowsSortable = this.$( '.so-rows-container' ).sortable( {
			appendTo: '#wpwrap',
			items: '.so-row-container',
			handle: '.so-row-move',
			axis: 'y',
			tolerance: 'pointer',
			scroll: false,
			stop: function ( e, ui ) {
				builderView.addHistoryEntry( 'row_moved' );

				var $$ =  $( ui.item ),
					row = $$.data( 'view' );

				builderView.model.get('rows').remove( row.model, {
					'silent' : true
				} );
				builderView.model.get('rows').add( row.model, {
					'silent' : true,
					'at' : $$.index()
				} );

				row.trigger( 'move', $$.index() );

				builderView.model.refreshPanelsData();
			}
		} );

		return this;
	},

	/**
	 * Refresh the row sortable
	 */
	refreshSortable: function () {
		// Refresh the sortable to account for the new row
		if ( ! _.isNull( this.rowsSortable ) ) {
			this.rowsSortable.sortable( 'refresh' );
		}
	},

	/**
	 * Set the field that's used to store the data
	 * @param field
	 */
	setDataField: function ( field, options ) {
		options = _.extend( {
			load: true
		}, options );

		this.dataField = field;
		this.dataField.data( 'builder', this );

		if ( options.load && field.val() !== '' ) {
			var data = this.dataField.val();
			try {
				data = JSON.parse( data );
			}
			catch ( err ) {
				data = {};
			}

			this.model.loadPanelsData( data );
			this.currentData = data;
			this.toggleWelcomeDisplay();
		}

		return this;
	},

	/**
	 * Store the model data in the data html field set in this.setDataField.
	 */
	storeModelData: function () {
		var data = JSON.stringify( this.model.get( 'data' ) );

		if ( $( this.dataField ).val() !== data ) {
			// If the data is different, set it and trigger a content_change event
			$( this.dataField ).val( data );
			$( this.dataField ).trigger( 'change' );
			this.trigger( 'content_change' );
		}
	},

	/**
	 * HAndle the visual side of adding a new row to the builder.
	 *
	 * @param row
	 * @param collection
	 * @param options
	 */
	onAddRow: function ( row, collection, options ) {
		options = _.extend( {noAnimate: false}, options );
		// Create a view for the row
		var rowView = new panels.view.row( {model: row} );
		rowView.builder = this;
		rowView.render();

		// Attach the row elements to this builder
		if ( _.isUndefined( options.at ) || collection.length <= 1 ) {
			// Insert this at the end of the widgets container
			rowView.$el.appendTo( this.$( '.so-rows-container' ) );
		} else {
			// We need to insert this at a specific position
			rowView.$el.insertAfter(
				this.$( '.so-rows-container .so-row-container' ).eq( options.at - 1 )
			);
		}

		if ( options.noAnimate === false ) {
			rowView.visualCreate();
		}

		this.refreshSortable();
		rowView.resize();
	},

	/**
	 * Display the dialog to add a new widget.
	 *
	 * @returns {boolean}
	 */
	displayAddWidgetDialog: function () {
		this.dialogs.widgets.openDialog();
	},

	/**
	 * Display the dialog to add a new row.
	 */
	displayAddRowDialog: function () {
		var row = new panels.model.row();
		var cells = new panels.collection.cells([{weight: 0.5}, {weight: 0.5}]);
		cells.each(function (cell) {
			cell.row = row;
		});
		row.set('cells', cells);
		row.builder = this.model;

		this.dialogs.row.setRowModel(row);
		this.dialogs.row.openDialog();
	},

	/**
	 * Display the dialog to add prebuilt layouts.
	 *
	 * @returns {boolean}
	 */
	displayAddPrebuiltDialog: function () {
		this.dialogs.prebuilt.openDialog();
	},

	/**
	 * Display the history dialog.
	 *
	 * @returns {boolean}
	 */
	displayHistoryDialog: function () {
		this.dialogs.history.openDialog();
	},

	/**
	 * Handle pasting a row into the builder.
	 */
	pasteRowHandler: function(){
		var pastedModel = panels.helpers.clipboard.getModel( 'row-model' );

		if( ! _.isEmpty( pastedModel ) && pastedModel instanceof panels.model.row ) {
			this.addHistoryEntry( 'row_pasted' );
			pastedModel.builder = this.model;
			this.model.get('rows').add( pastedModel, {
				at: this.model.get('rows').indexOf( this.model ) + 1
			} );
			this.model.refreshPanelsData();
		}
	},

	/**
	 * Get the model for the currently selected cell
	 */
	getActiveCell: function ( options ) {
		options = _.extend( {
			createCell: true,
		}, options );

		if( ! this.model.get('rows').length ) {
			// There aren't any rows yet
			if ( options.createCell ) {
				// Create a row with a single cell
				this.model.addRow( {}, [{ weight: 1 }], { noAnimate: true } );
			} else {
				return null;
			}
		}

		// Make sure the active cell isn't empty, and it's in a row that exists
		var activeCell = this.activeCell;
		if( _.isEmpty( activeCell ) || this.model.get('rows').indexOf( activeCell.model.row ) === -1 ) {
			return this.model.get('rows').last().get('cells').first();
		} else {
			return activeCell.model;
		}
	},

	/**
	 * Add a live editor to the builder
	 *
	 * @returns {panels.view.builder}
	 */
	addLiveEditor: function ( ) {
		if( _.isEmpty( this.config.liveEditorPreview ) ) {
			return this;
		}

		// Create the live editor and set the builder to this.
		this.liveEditor = new panels.view.liveEditor( {
			builder: this,
			previewUrl: this.config.liveEditorPreview
		} );

		// Display the live editor button in the toolbar
		if ( this.liveEditor.hasPreviewUrl() ) {
			this.$( '.so-builder-toolbar .so-live-editor' ).show();
		}

		this.trigger('builder_live_editor_added');

		return this;
	},

	/**
	 * Show the current live editor
	 */
	displayLiveEditor: function () {
		if ( _.isUndefined( this.liveEditor ) ) {
			return;
		}

		this.liveEditor.open();
	},

	/**
	 * Add the history browser.
	 *
	 * @return {panels.view.builder}
	 */
	addHistoryBrowser: function () {
		if( _.isEmpty( this.config.liveEditorPreview ) ) {
			return this;
		}

		this.dialogs.history = new panels.dialog.history();
		this.dialogs.history.builder = this;
		this.dialogs.history.entries.builder = this.model;

		// Set the revert entry
		this.dialogs.history.setRevertEntry( this.model );

		// Display the live editor button in the toolbar
		this.$( '.so-builder-toolbar .so-history' ).show();
	},

	/**
	 * Add an entry.
	 *
	 * @param text
	 * @param data
	 */
	addHistoryEntry: function ( text, data ) {
		if ( _.isUndefined( data ) ) {
			data = null;
		}

		if ( ! _.isUndefined( this.dialogs.history ) ) {
			this.dialogs.history.entries.addEntry( text, data );
		}
	},

	supports: function( thing ){

		if( thing === 'rowAction' ) {
			// Check if this supports any row action
			return this.supports( 'addRow' ) || this.supports( 'editRow' ) || this.supports( 'deleteRow' );
		} else if ( thing === 'widgetAction' ) {
			// Check if this supports any widget action
			return this.supports( 'addWidget' ) || this.supports( 'editWidget' ) || this.supports( 'deleteWidget' );
		}

		return _.isUndefined( this.config.builderSupports[ thing ] ) ? false : this.config.builderSupports[ thing ];
	},

	/**
	 * Handle a change of the content
	 */
	handleContentChange: function () {

		// Make sure we actually need to copy content.
		if ( panelsOptions.copy_content && this.attachedToEditor && this.$el.is( ':visible' ) ) {

			var panelsData = this.model.getPanelsData();
			if( ! _.isEmpty( panelsData.widgets ) ) {
				// We're going to create a copy of page builder content into the post content
				$.post(
					panelsOptions.ajaxurl,
					{
						action: 'so_panels_builder_content',
						panels_data: JSON.stringify( panelsData ),
						post_id: this.config.postId
					},
					function ( content ) {
						if( content !== '' ) {
							this.updateEditorContent( content );
						}
					}.bind( this )
				);
			}
		}
	},

	/**
	 * Update editor content with the given content.
	 *
	 * @param content
	 */
	updateEditorContent: function ( content ) {
		// Switch back to the standard editor
		if ( this.config.editorType !== 'tinyMCE' || typeof tinyMCE === 'undefined' || _.isNull( tinyMCE.get( "content" ) ) ) {
			var $editor = $( this.config.editorId );
			$editor.val( content ).trigger( 'change' ).trigger( 'keyup' );
		} else {
			var contentEd = tinyMCE.get( "content" );

			contentEd.setContent( content );

			contentEd.fire( 'change' );
			contentEd.fire( 'keyup' );
		}

		this.triggerYoastSeoChange();
	},

	/**
	 * Trigger a change on Yoast SEO
	 */
	triggerYoastSeoChange: function () {
		if ( $( '#yoast_wpseo_focuskw_text_input' ).length ) {
			var element = document.getElementById( 'yoast_wpseo_focuskw_text_input' ), event;

			if ( document.createEvent ) {
				event = document.createEvent( "HTMLEvents" );
				event.initEvent( "keyup", true, true );
			} else {
				event = document.createEventObject();
				event.eventType = "keyup";
			}

			event.eventName = "keyup";

			if ( document.createEvent ) {
				element.dispatchEvent( event );
			} else {
				element.fireEvent( "on" + event.eventType, event );
			}
		}
	},

	/**
	 * Handle displaying the builder
	 */
	handleDisplayBuilder: function () {
		var editor = typeof tinyMCE !== 'undefined' ? tinyMCE.get( 'content' ) : false;
		var editorContent = ( editor && _.isFunction( editor.getContent ) ) ? editor.getContent() : $( 'textarea#content' ).val();

		if (
			(
				_.isEmpty( this.model.get( 'data' ) ) ||
				( _.isEmpty( this.model.get( 'data' ).widgets ) && _.isEmpty( this.model.get( 'data' ).grids ) )
			) &&
			editorContent !== ''
		) {
			var editorClass = panelsOptions.text_widget;
			// There is a small chance a theme will have removed this, so check
			if ( _.isEmpty( editorClass ) ) {
				return;
			}

			// Create the existing page content in a single widget
			this.model.loadPanelsData( this.model.getPanelsDataFromHtml( editorContent, editorClass ) );
			this.model.trigger( 'change' );
			this.model.trigger( 'change:data' );
		}

		$('#post-status-info').addClass( 'for-siteorigin-panels' );
	},

	handleHideBuilder: function(){
		$('#post-status-info').show().removeClass( 'for-siteorigin-panels' );
	},

    wrapEditorExpandAdjust: function( ){
		try {
			var events = ( $.hasData( window ) && $._data( window ) ).events.scroll,
				event;

			for( var i = 0; i < events.length; i++ ) {
				if( events[i].namespace === 'editor-expand' ) {
                    event = events[i];

                    // Wrap the call
					$( window ).unbind( 'scroll', event.handler );
					$( window ).bind( 'scroll', function( e ){
						if( ! this.attachedVisible ) {
                            event.handler( e );
						}
					}.bind( this ) );

					break;
				}
			}
		}
		catch( e ){
			// We tried, we failed
			return;
		}
	},

	/**
	 * Either add or remove the narrow class
	 * @returns {exports}
	 */
	handleBuilderSizing: function () {
		var width = this.$el.width();

		if ( ! width ) {
			return this;
		}

		if ( width < 480 ) {
			this.$el.addClass( 'so-display-narrow' );
		} else {
			this.$el.removeClass( 'so-display-narrow' );
		}

		return this;
	},

	/**
	 * Set the parent dialog for all the dialogs in this builder.
	 *
	 * @param text
	 * @param dialog
	 */
	setDialogParents: function ( text, dialog ) {
		_.each( this.dialogs, function ( p, i, d ) {
			d[i].setParent( text, dialog );
		} );

		// For any future dialogs
		this.on( 'add_dialog', function ( newDialog ) {
			newDialog.setParent( text, dialog );
		}, this );
	},

	/**
	 * This shows or hides the welcome display depending on whether there are any rows in the collection.
	 */
	toggleWelcomeDisplay: function () {
		if ( ! this.model.get('rows').isEmpty() ) {
			this.$( '.so-panels-welcome-message' ).hide();
		} else {
			this.$( '.so-panels-welcome-message' ).show();
		}
	},

	/**
	 * Activate the contextual menu
	 * @param e
	 * @param menu
	 */
	activateContextMenu: function ( e, menu ) {
		var builder = this;

		// Of all the visible builders, find the topmost
		var topmostBuilder = $( '.siteorigin-panels-builder:visible' )
			.sort( function ( a, b ) {
				return $( a ).zIndex() > $( b ).zIndex() ? 1 : - 1;
			} )
			.last();

		var topmostDialog = $( '.so-panels-dialog-wrapper:visible' )
			.sort( function ( a, b ) {
				return $( a ).zIndex() > $( b ).zIndex() ? 1 : - 1;
			} )
			.last();

		var closestDialog = builder.$el.closest('.so-panels-dialog-wrapper');

		// Only run this if its element is the topmost builder, in the topmost dialog
		if (
			builder.$el.is( topmostBuilder ) &&
			(
				topmostDialog.length === 0 ||
				topmostDialog.is( closestDialog )
			)
		) {
			// Get the element we're currently hovering over
			var over = $( [] )
				.add( builder.$( '.so-panels-welcome-message:visible' ) )
				.add( builder.$( '.so-rows-container > .so-row-container' ) )
				.add( builder.$( '.so-cells > .cell' ) )
				.add( builder.$( '.cell-wrapper > .so-widget' ) )
				.filter( function ( i ) {
					return menu.isOverEl( $( this ), e );
				} );

			var activeView = over.last().data( 'view' );
			if ( activeView !== undefined && activeView.buildContextualMenu !== undefined ) {
				// We'll pass this to the current active view so it can popular the contextual menu
				activeView.buildContextualMenu( e, menu );
			}
			else if( over.last().hasClass( 'so-panels-welcome-message' ) ) {
				// The user opened the contextual menu on the welcome message
				this.buildContextualMenu( e, menu );
			}
		}
	},

	/**
	 * Build the contextual menu for the main builder - before any content has been added.
	 */
	buildContextualMenu: function( e, menu ){
		var actions = {};

		if( this.supports( 'addRow' ) ) {
			actions.add_row = { title: panelsOptions.loc.contextual.add_row };
		}

		if ( panels.helpers.clipboard.canCopyPaste() ) {
			if( panels.helpers.clipboard.isModel( 'row-model' ) && this.supports( 'addRow' ) ) {
				actions.paste_row = { title: panelsOptions.loc.contextual.row_paste };
			}
		}

		if( ! _.isEmpty( actions ) ) {
			menu.addSection(
				'builder-actions',
				{
					sectionTitle: panelsOptions.loc.contextual.row_actions,
					search: false,
				},
				actions,
				function ( c ) {
					switch ( c ) {
						case 'add_row':
							this.displayAddRowDialog();
							break;

						case 'paste_row':
							this.pasteRowHandler();
							break;
					}
				}.bind( this )
			);
		}
	},

	loadTutorials: function( event ){
		if( ! _.isUndefined( event ) ) {
			event.preventDefault();
		}

		var $dd = this.$('.so-learn-wrapper .so-tool-button-dropdown');
		$dd.addClass( 'so-loading' ).find( '.view-message' ).hide();

		var loadResponse = function( response ){
			if( ! _.isUndefined( response.error ) ) {
				$dd.find( '.view-message' ).show().find('p').html(response.error);
			}
			else if( response.length ) {
				panelsOptions.cache.tutorials = response;

				for( var i in response.slice( 0,4 ) ) {
					$dd.find( '.view-tutorials ul' ).append(
						$('<li></li>')
							.append(
								$('<a target="_blank"></a>')
									.text( response[i].title )
									.attr( 'href', response[i].url )
							)
							.append(
								$('<small></small>').text( response[i].excerpt )
							)
					);
				}

				$dd.find('.view-tutorials').show();
			}
			$dd.removeClass( 'so-loading' );
		};

		if( typeof panelsOptions.cache.tutorials === 'undefined' ) {
			$.get(
				panelsOptions.ajaxurl,
				{ action: 'so_panels_get_tutorials' },
				loadResponse
			);
		}
		else {
			loadResponse( panelsOptions.cache.tutorials );
		}
	},
} );
