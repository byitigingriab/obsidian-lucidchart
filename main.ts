import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, Vault, moment } from 'obsidian';

interface LucidchartPluginSettings {
	apiKey: string;
	baseUrl: string;
	attachmentPath: string;
}

const DEFAULT_SETTINGS: LucidchartPluginSettings = {
	apiKey: '<api key>',
	baseUrl: 'https://api.lucid.co',
	attachmentPath: '' 
}

export default class LucidchartPlugin extends Plugin {
	settings: LucidchartPluginSettings;

	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: 'refresh-lucid-drawing-command',
			name: 'Reload Lucidchart Drawing',
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				var imageLink = editor.getSelection();
				var regex = new RegExp('lucidchart~(.*)~(.*)~(.*)\.png');
				var match = imageLink.match(regex);

				if(match) {
					let documentId = match[1];
					let pageId = match[3];

					let filePath = await this.exportLucidDrawing(documentId, pageId);

					var newLink = '';
					if(imageLink.startsWith('![[')) {
						newLink += '![[' + filePath;
					}
					else {
						newLink += filePath;
					}

					if(imageLink.endsWith(']]')) {
						newLink += ']]';
					}
					else {
						// Do nothing
					}

					editor.replaceSelection(newLink);

					new Notice('Lucidchart Drawing Updated');
				}
			}
		});

		this.addCommand({
			id: 'insert-lucid-drawing-command',
			name: 'Insert Lucidchart Drawing',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				new LucidchartModal(this.app, async (url : string) => {
					var regex = new RegExp('.*\/lucidchart\/(.*)\/.*page=(.*)#');
					var match = url.match(regex);
					
					if(match)
					{
						let documentId = match[1];
						let pageId = match[2];

						let filePath = await this.exportLucidDrawing(documentId, pageId);

						editor.replaceSelection('![['+ filePath +']]')

						new Notice('Lucidchart Drawing Inserted');
					}
				}).open();
			}
		});

		this.addSettingTab(new LucidchartSettingTab(this.app, this));
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	} 

	async exportLucidDrawing(documentId:string, pageId:string) : Promise<string> {
		let fetch = require('node-fetch');
					
		const responseDocument = await fetch(this.settings.baseUrl + '/documents/' + documentId, {
			method: 'GET',
			headers: {'Authorization': 'Bearer ' + this.settings.apiKey, 'Lucid-Api-Version': '1'}
		});

		let doc = await responseDocument.json();

		let filePath = this.settings.attachmentPath + '/lucidchart~' + documentId + '~' + doc.version + '~' + pageId + '.png';

		let fileExist = this.app.vault.getFileByPath(filePath);

		if(!fileExist){
			// Export new version to file
			const responseImage = await fetch(this.settings.baseUrl + '/documents/' + documentId + '?pageId=' + pageId + '&crop=content', {
				method: 'GET',
				headers: {
					'Authorization': 'Bearer ' + this.settings.apiKey, 
					'Lucid-Api-Version': '1',
					'Accept': 'image/png'
				}
			});

			let img = await responseImage.blob();

			let imgAsArrayBuffer = await img.arrayBuffer();
		
			await this.app.vault.createBinary(filePath, imgAsArrayBuffer);
		}
		else {
			// No new version display current version
		}

		return filePath;
	}
}

class LucidchartModal extends Modal {
	constructor(app: App, onSubmit: (result: string) => void) {
	  super(app);
	  this.setTitle('Insert Lucidchart Drawing');
  
	  let name = '';
	  new Setting(this.contentEl)
		.setName('Url')
		.setTooltip('Lucidchart Drawing URL from Browser')
		.addText((text) =>
		  text.onChange((value) => {
			name = value;
		  }));
  
	  new Setting(this.contentEl)
		.addButton((btn) =>
		  btn
			.setButtonText('Submit')
			.setCta()
			.onClick(() => {
			  this.close();
			  onSubmit(name);
			}));
	}
  }

class LucidchartSettingTab extends PluginSettingTab {
	plugin: LucidchartPlugin;

	constructor(app: App, plugin: LucidchartPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		let folders = this.app.vault.getAllFolders(true).map((x) => x.path);

		containerEl.empty();

		new Setting(containerEl)
			.setName('Lucidchart API Key')
			.setDesc('API Key created in the Lucidchart developer portal')
			.addText(text => text
				.setPlaceholder('Enter your api key')
				.setValue(this.plugin.settings.apiKey)
				.onChange(async (value) => {
					this.plugin.settings.apiKey = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
		.setName('Lucidchart API Base URL')
		.addText(text => text
			.setValue(this.plugin.settings.baseUrl)
			.onChange(async (value) => {
				this.plugin.settings.baseUrl = value;
				await this.plugin.saveSettings();
			}));

		new Setting(containerEl)
		.setName('Drawing Path')
		.addDropdown((dd) => { 
			folders.forEach(element => {
				dd.addOption(element, element)
			});
		 	
			dd
			.setValue(this.plugin.settings.attachmentPath)
			.onChange(async (value) => {
				this.plugin.settings.attachmentPath = value;
				await this.plugin.saveSettings();
			})
		})
	}
}
