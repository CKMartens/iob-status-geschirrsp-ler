/**
  ##########         STATUS-GESCHIRRSPUELER          ##########
  Den Status des Geschirrspülers (fertig/läuft usw.) anhand des Stromverbrauches feststellen und für VIS ausgeben.

  Idee aus https://forum.iobroker.net/topic/16306/gel%C3%B6st-waschetrockner-die-2-f%C3%A4llt-scheinbar-zwischen-drin-auch-immer-unter-100-watt

  17.12.2019:   V0.1.0  komplette Überarbeitung

  to do:

  Author: CKMartens (carsten.martens@outlook.de)
  License: GNU General Public License V3, 29. Juni 2007
**/

/**
  ##########         Variablen          ##########
**/

// Informationen mitloggen?
var DEBUG = true;

// Verwendeter Aktor zum Messen des Stromverbauchs
const AKTOR_AN = 'deconz.0.Lights.2.on';
const AKTOR_VERBRAUCH = 'deconz.0.Sensors.7.power';

// Ausgabe der Fertigmeldung
var ALEXA = true;                                                                // Ausgabe über Amazon Echo (über Adapter Alexa2)
var ECHO_DEVICE = 'G090P3028452005X';
var TELEGRAM = true;                                                            // Ausgabe über Telegram (über Adapter Telegram)
var EMPFAENGER = 'Carsten, Elke';

// Ab welcher Wattzahl ist die Maschine fertig (Standby Verbrauch)
var MIN_WATT = 1;
// Ab welcher Wattzahl soll regelmäßig geprüft werden ob die Maschine fertig (Knitterschutz Verbrauch)
var CHECK_WATT = 5;
// Welche Wattzahl wird im lauf nicht unterschritten
var ON_WATT = 75;

var checkEnde;

/**
  ##########         Datenpunkte          ##########
**/

// Datenpunkt unter 0_userdata.0 erstellen
const PATH = 'Status.Hausgeraete.Geschirrspueler.';

const DP_STROMAN = PATH + 'StromAn';
const DP_FERTIG = PATH + 'Fertig';
const DP_FERTIGZEIT = PATH + 'FertigZeit';
const DP_LAEUFT = PATH + 'Laeuft';

const DP_STROMAN_COMMON = {
    type: 'boolean',
    read: true,
    write: true,
    name: 'Ist bei dem Geschirrspüler der Strom an?',
    desc: 'Strom an',
    role: 'switch'
};
const DP_FERTIG_COMMON = {
    type: 'boolean',
    read: true,
    write: true,
    name: 'Ist der Geschirrspüler fertig?',
    desc: 'Geschirrspüler fertig',
    role: 'switch'
};
const DP_LAEUFT_COMMON = {
    type: 'boolean',
    read: true,
    write: true,
    name: 'Läuft der Geschirrspüler?',
    desc: 'Geschirrspüler Läuft',
    role: 'switch'
};
const DP_FERTIGZEIT_COMMON = {
    type: 'string',
    read: true,
    write: true,
    name: 'Datum und Uhrzeit an dem der Geschirrspüler zuletzt fertig war',
    desc: 'Geschirrspüler war fertig um',
    role: 'value'
};

/**
  ##########         Skript          ##########
**/

createDp('0_userdata.0.' + DP_STROMAN, DP_STROMAN_COMMON);
createDp('0_userdata.0.' + DP_FERTIG, DP_FERTIG_COMMON);
createDp('0_userdata.0.' + DP_LAEUFT, DP_LAEUFT_COMMON);
createDp('0_userdata.0.' + DP_FERTIGZEIT, DP_FERTIGZEIT_COMMON);

// Skriptstart
Start();

/**
  ##########         Funktionen          ##########
**/

/**
 * Funktion bei Start des Skripts
 */
function Start() {
  var timeout;
  timeout = setTimeout(function () {
    setState('0_userdata.0.' + DP_STROMAN, false);
    setState('0_userdata.0.' + DP_FERTIG, false);
    setState('0_userdata.0.' + DP_LAEUFT, false);
    if (DEBUG === true)  console.log('Haushaltsgeräte: Waschmaschine Skriptstart');
  }, 1500);
}

/**
 * Legt die Datenpunkte unter 0_userdata.0 an
 * Funktion von Pail53
 * siehe: https://forum.iobroker.net/topic/26839/vorlage-skript-erstellen-von-user-datenpunkten
 * @param {string}    id                Bezeichnung des Datenpunktes
 * @param {boolean}   common            Die Attribute des Datenpunktes
 */
function createDp(id, common) {
    if($(id).length) log('Datenpunkt ' + id + ' existiert bereits !', 'warn');
    else {
        var obj = {};
        obj.type = 'state';
        obj.common = common;
        setObject(id, obj, function (err) {
            if (err) log('Cannot write object: ' + err)
            else {
                var init = null;
                if(common.def === undefined) {
                    if(common.type === 'number') init = 0;
                    if(common.type === 'boolean') init = false;
                    if(common.type === 'string') init = '';
                } else init = common.def;
                setState(id, init, true);
            }
        });
    }
}

/**
  ##########         Trigger          ##########
**/

// Prüfen ob Waschmaschine läuft
on({id: AKTOR_VERBRAUCH, change: "gt"}, function (obj) {
  if (getState('0_userdata.0.' + DP_STROMAN).val === true) {
    // Waschmaschine läuft
    if (getState(AKTOR_VERBRAUCH).val >= ON_WATT && getState('0_userdata.0.' + DP_LAEUFT).val == false) {
      setState('0_userdata.0.' + DP_FERTIG, false);
      setState('0_userdata.0.' + DP_LAEUFT, true);
      if (DEBUG === true)  console.log('Haushaltsgeräte: Waschmaschine läuft');
    }
 }
});

// Prüfen ob der Waschmaschine fertig
on({id: AKTOR_VERBRAUCH, change: "lt"}, function (obj) {
  if (getState(AKTOR_VERBRAUCH).val < CHECK_WATT && getState('0_userdata.0.' + DP_LAEUFT).val == true && checkEnde == false) {
    checkEnde = setTimeout(function () {
      if (getState(AKTOR_VERBRAUCH).val < MIN_WATT) {
        // Waschmaschine ist fertig
        setState('0_userdata.0.' + DP_LAEUFT, false);
        setState('0_userdata.0.' + DP_FERTIG, true);
        setState('0_userdata.0.' + DP_FERTIGZEIT, formatDate(new Date(), "TT.MM.JJJJ. SS:mm:ss"));
        // Strom abschalten
        setStateDelayed(AKTOR_AN, false, 1000, false);
        if (ALEXA) {
          let speak = 'Hallo. Entschuldige das ich störe. Aber die Waschmaschine ist fertig. Der Strom zur Steckdose wurde abgeschaltet.';
          setState('alexa2.0.Echo-Devices.' + ECHO_DEVICE + '.Commands.speak', speak)
        }
        if (TELEGRAM) {
          sendTo("telegram.0", "send", {
            text: 'Hausgeräte: Waschmaschine ist fertig',
            user: EMPFAENGER
          });
        }
        if (DEBUG === true)  console.log('Haushaltsgeräte: Waschmaschine ist fertig, der Strom wurde angeschaltet');
      }
    (function () { if (checkEnde) {
      clearTimeout(checkEnde);
      checkEnde = null;
    }})();
      checkEnde = false;
    }, 300000);
  }
});

// Prüfen ob Waschmaschine Strom hat
on({id: AKTOR_AN, change: "ne"}, function (obj) {
  if (AKTOR_AN === true && getState('0_userdata.0.' + DP_STROMAN).val === false) {
    // Stromzufuhr wurde angeschaltet
    setState('0_userdata.0.' + DP_STROMAN, true);
    if (DEBUG === true)  console.log('Haushaltsgeräte: Waschmaschine Strom wurde angeschaltet');
  }
  if (AKTOR_AN === false && getState('0_userdata.0.' + DP_STROMAN).val === true) {
    // Stromzufuhr wurde ausgeschaltet
    setState('0_userdata.0.' + DP_STROMAN, false);
    if (DEBUG === true)  console.log('Haushaltsgeräte: Waschmaschine Strom wurde ausgeschaltet');
  }
});

// Waschmaschine läuft weiter
on({id: AKTOR_VERBRAUCH, change: "gt"}, function (obj) {
  if (getState(AKTOR_VERBRAUC).val > CHECK_WATT && checkEnde == true) {
    (function () {if (checkEnde) {clearTimeout(checkEnde); checkEnde = null;}})();
    checkEnde = false;
  }
});
