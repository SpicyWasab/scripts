#!/usr/bin/env node

// IMPORTS
import fetch from 'node-fetch';
import prompt from 'prompt-promise';
import ora from 'ora';

// MAIN PART
// prompt for credentials
const username = await prompt('Identifiant : ');
const password = await prompt.password('Mot de passe : ');


// login to ecoledirecte
// spinner
let loginSpinner = ora({
    color: 'blue', // ecoledirecte is blue
    text: 'Connexion à EcoleDirecte ...'
}).start();

// request
const loginRes = await fetch('https://api.ecoledirecte.com/v3/login.awp', {
    method: 'post',
    body: parseBody({
        identifiant: username,
        motdepasse: password
    }),
    // apparently, ecoledirecte specifically doesn't like the 'node-fetch' agent, so let's use another user-agent xD
    headers: getHeader()
});

// get code, token, message and datas
const { code: loginResCode, token, message, data } = await loginRes.json();

// code != 200 (fail) -> panic with message
if(loginResCode != 200) panic(message, loginSpinner);

// otherwise, get the firstname, lastname and id
const { prenom: firstName, nom: lastName, id } = data.accounts[0];

// succeed the spinner
loginSpinner.succeed(`Connecté à EcoleDirecte - ${lastName} ${firstName}`);


// fetch notes
// spinner
const notesSpinner = ora({
    color: 'blue', // ecoledirecte is still blue :)
    text: 'Récupération des notes ...'
}).start();

// request
const notesRes = await fetch(`https://api.ecoledirecte.com/v3/eleves/${id}/notes.awp?verbe=get`, {
    method: 'post',
    body: parseBody({
        token
    }),
    headers: getHeader()
});

// get the code, msg, and notes
const { code: notesResCode, msg, data: { notes } } = await notesRes.json();

// if code is not 200 (success) panic
if(notesResCode != 200) panic(msg, notesSpinner);

// succeed the spinner
notesSpinner.succeed('Les notes ont été récupérées avec succès');

// available periods (halfs, terms ...)
const availablePeriods = [...(new Set(notes.map(note => note.codePeriode)))];

// display available periods
console.table(availablePeriods);

// ask for the period index (default is the last period, wich is the current period (I think :thinking:))
const currentPeriodIndex = availablePeriods.length - 1;
const verify = (value) => parseInt(index) < 0 || parseInt(index) >= availablePeriods.length;
const periodIndex = await safePromptNumber('Veuillez entrer l\'index de la période (semestre, trimestres, etc ...) dont vous voulez obtenir les moyennes.', currentPeriodIndex, verify);

// get the selected period code
const selectedPeriod = availablePeriods[periodIndex];

// ask for over (note/over) (default is 20)
let over = await safePromptNumber('Sur combien voulez-vous obtenir les moyennes ?', 20, (value) => !isNaN(value));

// ask for precision (digits after point) (default is 2)
let precision = await safePromptNumber('Veuillez entrer une précision (nombre de chiffres après la virgule).', 1, (value) => !isNaN(value));

// notes calculated and sorted by subjects
let subjectsNotes = { };

// for each note
for(const noteDatas of notes) {
    // get the matiere, period, noteOver, value, coef, isANumberOrALetter (eg: 'Abs' -> absent)
    const { libelleMatiere: subject, codePeriode: notePeriod, noteSur: noteOver, valeur: value, coef, enLettre: isLetter } = noteDatas;

    // if not selected period, skip
    if(notePeriod != selectedPeriod) continue;
    // if the subject isn't already registered in subjectNotes, add an entry to subjectNotes for this subject
    if(!(subject in subjectsNotes)) subjectsNotes[subject] = [ ];
    // if not numeric (eg: 'Abs'), skip
    if(isLetter) continue;
    
    // a simple function to transform '17,4' type number to actual float
    const getFloat = (numberString) => parseFloat(numberString.replace(',', '.'));

    // push the matiere entry
    subjectsNotes[subject].push({
        value: getFloat(value) / getFloat(noteOver), // note value
        coef: getFloat(coef) // coef
    });
}

// the object that will be displayed to the end user through console.table()
let displayedAverages = { };

// moyenne generale
let overallAverage = 0;
// i (we're assuming every matiere is coef 1, so overallAverage will be divided by i)
let i = 0;

// for every subject entry (notes of that subject)
for(const subject in subjectsNotes) {
    const notes = subjectsNotes[subject];

    // if no note, average is undefined
    if(subjectsNotes.length === 0) subjectsNotes[subject] = undefined;
    
    // sum of notes, sum of coefs
    let sumOfNotes = 0;
    let sumOfCoefs = 0;

    // for every note
    for(const note of notes) {
        sumOfNotes += note.value * note.coef; // sum of notes
        sumOfCoefs += note.coef; // sum of coef
    }

    // calculate the average
    const average = sumOfNotes / sumOfCoefs * over;
    
    displayedAverages[subject] = average.toFixed(precision);
    overallAverage += average;
    i++;
}

// sort the averages from the best to the worst :
displayedAverages = Object.fromEntries((Object.entries(displayedAverages)).sort((a, b) => {
    return parseFloat(b[1]) - parseFloat(a[1]);
}));

// calculate overall average
overallAverage /= i;
displayedAverages['MOYENNE GENERALE'] = overallAverage.toFixed(precision);

// (finally !) display averages
console.table(displayedAverages);

// successfully terminate the process, because, for whatever reason the process doesn't terminate itself.
// I think it could be due to prompt-promise. I will probably write my own "input-password" function later.
process.exit(0);


// FUNCTIONS BELOW THIS LINE

function parseBody(body) {
    return `data=${JSON.stringify(body)}`
}

/**
 * Stop the spinner, and exit the program with error code 1
 * @param {String} text 
 * @param {import('ora').Ora} spinner 
 */
function panic(text, spinner) {
    spinner.fail(text);
    process.exit(1);
}

/**
 * Because EcoleDirecte doesn't like node-fetch's default user-agent (wich is probably "node-fetch") :)
 * @returns {Object};
 */
function getHeader() {
    return { 'User-Agent': "Bonjour EcoleDirecte. Je veux juste calculer ma moyenne en utilisant node.js, mais apparemment l'user agent 'node\\-fetch' (celui par défaut en utilisant le module 'node\\-fetch') ne vous convient pas (c'est d'ailleurs pour ça que je mets un antislash en plein milieu, sinon ça ne fonctionne pas ...). Permettez-moi donc d'utiliser autre chose. (Bonne journée à vous si quelqu'un lit ce message :))" };
}

/**
 * Prompt for a number until value is successfully verified
 * @param {String} text the text displayed to the user
 * @param {*} defaultValue the default value, if nothing is provided
 * @param {Function} verify function to verify the value
 */
async function safePromptNumber(text, defaultValue, verify) {
    while(true) {
        const value = await prompt(`${text} (defaut : ${defaultValue}) `);
    
        // if nothing selected, break, so default choice
        if(!value) return defaultValue;
    
        // if doesn't successfully verified, reprompt
        if(!verify(value)) continue;
    
        return parseInt(value);
    }
}
