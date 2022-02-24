#!/usr/bin/env node
import ytdl from 'ytdl-core';
import { createWriteStream } from 'fs';
import ora from 'ora';

// get url and filename
const url = await input('Donnez le lien d\'une vidéo youtube :');
const fileName = await input('Donnez le nom du fichier :');

// validate url
if(!ytdl.validateURL(url)) {
	console.error('URL invalide.');
	process.exit(1);
}

// fetch video infos
const videoInfo = await ytdl.getInfo(url);

// get list of available formats
const { formats } = videoInfo;

// make a "user friendly" list
const displayedFormats = formats.map(format => {
	const { container, hasAudio, hasVideo, audioBitrate, fps, qualityLabel } = format;

	return { 
		conteneur: container,
		audio: hasAudio ? `${audioBitrate} bit/s` : undefined,
		video: hasVideo ? `${qualityLabel}/${fps}fps` : undefined
	}
});

// display the list
console.table(displayedFormats);

// prompt for the format, the first is the default one
let format = formats[0];

while(true) {
	// prompt for the format index
	const choice = await input('Donnez l\'index du format de vidéo :');
	
	// if no choice, break (so default)
	if(!choice) break;

	// parse index to string, and get the selected format from the list
	const index = parseInt(choice);	
	const selectedFormat = formats[index];

	// if the format doesn't exist, restart the loop
	if(!selectedFormat) continue;
	
	// otherwise, terminate the loop
	format = selectedFormat;
	break;
}

// display infos
const { title, author: { name: author } } = videoInfo.videoDetails;

// start downloading
const videoStream = ytdl(url);

videoStream.pipe(createWriteStream(`${fileName}.${format.container}`));

// display progression
const bitLength = parseInt(format.contentLength);
let downloadedLength = 0;
const spinner = ora('Démarrage du téléchargement').start();
spinner.color = 'red';

videoStream.on('data', chunk => {
	downloadedLength += chunk.length;
	const progression = Math.round((downloadedLength / bitLength * 100));

	spinner.text = `Téléchargement de la vidéo - ${progression}%`;
});

// when finish
videoStream.on('end', () => {
	spinner.succeed(`Le téléchargement de la vidéo est terminé (${fileName}.${format.container}) !`);
	process.exit(0);
});

// handle error
videoStream.on('error', () => {
	spinner.fail('Une erreur est survenue en téléchargeant la vidéo.');
	process.exit(1);
});

/**
 * Prompt the user in the console.
 * @param {String} text the text to display 
 * @returns {Promise<String>}
 */
function input(text) {
	console.log(text);

	return new Promise((resolve, reject) => {
		process.stdin.once('data', data => resolve(data.toString().trim()));
	});
}