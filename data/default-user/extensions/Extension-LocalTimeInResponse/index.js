import { appendMediaToMessage, callPopup, extension_prompt_types, getRequestHeaders, saveSettingsDebounced, setExtensionPrompt, substituteParams } from '../../../../script.js';
import { appendFileContent, uploadFileAttachment } from '../../../chats.js';
import { doExtrasFetch, extension_settings, getApiUrl, getContext, modules, renderExtensionTemplate } from '../../../extensions.js';
import { registerDebugFunction } from '../../../power-user.js';
import { SECRET_KEYS, secret_state, writeSecret } from '../../../secrets.js';
import { registerSlashCommand } from '../../../slash-commands.js';
import { extractTextFromHTML, isFalseBoolean, isTrueBoolean, onlyUnique, trimToEndSentence, trimToStartSentence } from '../../../utils.js';

const storage = new localforage.createInstance({ name: 'SillyTavern_LocalTimeInResponse' });
const extensionPromptMarker = '___LocalTimeInResponse___';

const defaultSettings = {
	enabled: false,
	mgbcharactergreetings: false,
	chosedataonename: "ChoseOneName",
	chosedataonedata: "ChoseOneData",
	chosedatatwoname: "ChoseTwoName",
	chosedatatwodata: "ChoseTwoData",
	chosedatathreename: "ChoseThreeName",
	chosedatathreedata: "ChoseThreeData",
	chosedatafourname: "ChoseFourName",
	chosedatafourdata: "ChoseFourData",
	chosedatafivename: "ChoseFiveName",
	chosedatafivedata: "ChoseFiveData",
	chosedataonenametwo: "ChoseOneName",
	chosedataonedatatwo: "ChoseOneData",
	chosedatatwonametwo: "ChoseTwoName",
	chosedatatwodatatwo: "ChoseTwoData",
	chosedatathreenametwo: "ChoseThreeName",
	chosedatathreedatatwo: "ChoseThreeData",
	chosedatafournametwo: "ChoseFourName",
	chosedatafourdatatwo: "ChoseFourData",
	chosedatafivenametwo: "ChoseFiveName",
	chosedatafivedatatwo: "ChoseFiveData",	
	chosedataonenamethree: "ChoseOneName",
	chosedataonedatathree: "ChoseOneData",
	chosedatatwonamethree: "ChoseTwoName",
	chosedatatwodatathree: "ChoseTwoData",
	chosedatathreenamethree: "ChoseThreeName",
	chosedatathreedatathree: "ChoseThreeData",
	chosedatafournamethree: "ChoseFourName",
	chosedatafourdatathree: "ChoseFourData",
	chosedatafivenamethree: "ChoseFiveName",
	chosedatafivedatathree: "ChoseFiveData",	
};


// LOAD SETTINGS FOR DYNAMIC BLOCKS
function loadSettings() {
// data set one	
	$('#localtimeinresponse_chosedataonename').val(extension_settings.localtimeinresponse.chosedataonename).trigger('input');
	$('#localtimeinresponse_chosedataonedata').val(extension_settings.localtimeinresponse.chosedataonedata).trigger('input');
	$('#localtimeinresponse_chosedatatwoname').val(extension_settings.localtimeinresponse.chosedatatwoname).trigger('input');
	$('#localtimeinresponse_chosedatatwodata').val(extension_settings.localtimeinresponse.chosedatatwodata).trigger('input');
	$('#localtimeinresponse_chosedatathreename').val(extension_settings.localtimeinresponse.chosedatathreename).trigger('input');
	$('#localtimeinresponse_chosedatathreedata').val(extension_settings.localtimeinresponse.chosedatathreedata).trigger('input');
	$('#localtimeinresponse_chosedatafourname').val(extension_settings.localtimeinresponse.chosedatafourname).trigger('input');
	$('#localtimeinresponse_chosedatafourdata').val(extension_settings.localtimeinresponse.chosedatafourdata).trigger('input');
	$('#localtimeinresponse_chosedatafivename').val(extension_settings.localtimeinresponse.chosedatafivename).trigger('input');
	$('#localtimeinresponse_chosedatafivedata').val(extension_settings.localtimeinresponse.chosedatafivedata).trigger('input');
// data set two
	$('#localtimeinresponse_chosedataonenametwo').val(extension_settings.localtimeinresponse.chosedataonenametwo).trigger('input');
	$('#localtimeinresponse_chosedataonedatatwo').val(extension_settings.localtimeinresponse.chosedataonedatatwo).trigger('input');
	$('#localtimeinresponse_chosedatatwonametwo').val(extension_settings.localtimeinresponse.chosedatatwonametwo).trigger('input');
	$('#localtimeinresponse_chosedatatwodatatwo').val(extension_settings.localtimeinresponse.chosedatatwodatatwo).trigger('input');
	$('#localtimeinresponse_chosedatathreenametwo').val(extension_settings.localtimeinresponse.chosedatathreenametwo).trigger('input');
	$('#localtimeinresponse_chosedatathreedatatwo').val(extension_settings.localtimeinresponse.chosedatathreedatatwo).trigger('input');
	$('#localtimeinresponse_chosedatafournametwo').val(extension_settings.localtimeinresponse.chosedatafournametwo).trigger('input');
	$('#localtimeinresponse_chosedatafourdatatwo').val(extension_settings.localtimeinresponse.chosedatafourdatatwo).trigger('input');
	$('#localtimeinresponse_chosedatafivenametwo').val(extension_settings.localtimeinresponse.chosedatafivenametwo).trigger('input');
	$('#localtimeinresponse_chosedatafivedatatwo').val(extension_settings.localtimeinresponse.chosedatafivedatatwo).trigger('input');
// data set three	
	$('#localtimeinresponse_chosedataonenamethree').val(extension_settings.localtimeinresponse.chosedataonenamethree).trigger('input');
	$('#localtimeinresponse_chosedataonedatathree').val(extension_settings.localtimeinresponse.chosedataonedatathree).trigger('input');
	$('#localtimeinresponse_chosedatatwonamethree').val(extension_settings.localtimeinresponse.chosedatatwonamethree).trigger('input');
	$('#localtimeinresponse_chosedatatwodatathree').val(extension_settings.localtimeinresponse.chosedatatwodatathree).trigger('input');
	$('#localtimeinresponse_chosedatathreenamethree').val(extension_settings.localtimeinresponse.chosedatathreenamethree).trigger('input');
	$('#localtimeinresponse_chosedatathreedatathree').val(extension_settings.localtimeinresponse.chosedatathreedatathree).trigger('input');
	$('#localtimeinresponse_chosedatafournamethree').val(extension_settings.localtimeinresponse.chosedatafournamethree).trigger('input');
	$('#localtimeinresponse_chosedatafourdatathree').val(extension_settings.localtimeinresponse.chosedatafourdatathree).trigger('input');
	$('#localtimeinresponse_chosedatafivenamethree').val(extension_settings.localtimeinresponse.chosedatafivenamethree).trigger('input');
	$('#localtimeinresponse_chosedatafivedatathree').val(extension_settings.localtimeinresponse.chosedatafivedatathree).trigger('input');	
}

// SET UP LISTENERS FOR DYNAMIC BLOCKS
function setupListeners() {
// data set one	
	$('#localtimeinresponse_chosedataonename').off('click').on('input', onMGBCharMemoryChoseDataOneName);
	$('#localtimeinresponse_chosedataonedata').off('click').on('input', onMGBCharMemoryChoseDataOneData);
	$('#localtimeinresponse_chosedatatwoname').off('click').on('input', onMGBCharMemoryChoseDataTwoName);
	$('#localtimeinresponse_chosedatatwodata').off('click').on('input', onMGBCharMemoryChoseDataTwoData);
	$('#localtimeinresponse_chosedatathreename').off('click').on('input', onMGBCharMemoryChoseDataThreeName);
	$('#localtimeinresponse_chosedatathreedata').off('click').on('input', onMGBCharMemoryChoseDataThreeData);
	$('#localtimeinresponse_chosedatafourname').off('click').on('input', onMGBCharMemoryChoseDataFourName);
	$('#localtimeinresponse_chosedatafourdata').off('click').on('input', onMGBCharMemoryChoseDataFourData);
	$('#localtimeinresponse_chosedatafivename').off('click').on('input', onMGBCharMemoryChoseDataFiveName);
	$('#localtimeinresponse_chosedatafivedata').off('click').on('input', onMGBCharMemoryChoseDataFiveData);
// data set two
	$('#localtimeinresponse_chosedataonenametwo').off('click').on('input', onMGBCharMemoryChoseDataOneNametwo);
	$('#localtimeinresponse_chosedataonedatatwo').off('click').on('input', onMGBCharMemoryChoseDataOneDatatwo);
	$('#localtimeinresponse_chosedatatwonametwo').off('click').on('input', onMGBCharMemoryChoseDataTwoNametwo);
	$('#localtimeinresponse_chosedatatwodatatwo').off('click').on('input', onMGBCharMemoryChoseDataTwoDatatwo);
	$('#localtimeinresponse_chosedatathreenametwo').off('click').on('input', onMGBCharMemoryChoseDataThreeNametwo);
	$('#localtimeinresponse_chosedatathreedatatwo').off('click').on('input', onMGBCharMemoryChoseDataThreeDatatwo);
	$('#localtimeinresponse_chosedatafournametwo').off('click').on('input', onMGBCharMemoryChoseDataFourNametwo);
	$('#localtimeinresponse_chosedatafourdatatwo').off('click').on('input', onMGBCharMemoryChoseDataFourDatatwo);
	$('#localtimeinresponse_chosedatafivenametwo').off('click').on('input', onMGBCharMemoryChoseDataFiveNametwo);
	$('#localtimeinresponse_chosedatafivedatatwo').off('click').on('input', onMGBCharMemoryChoseDataFiveDatatwo);
// data set three
	$('#localtimeinresponse_chosedataonenamethree').off('click').on('input', onMGBCharMemoryChoseDataOneNamethree);
	$('#localtimeinresponse_chosedataonedatathree').off('click').on('input', onMGBCharMemoryChoseDataOneDatathree);
	$('#localtimeinresponse_chosedatatwonamethree').off('click').on('input', onMGBCharMemoryChoseDataTwoNamethree);
	$('#localtimeinresponse_chosedatatwodatathree').off('click').on('input', onMGBCharMemoryChoseDataTwoDatathree);
	$('#localtimeinresponse_chosedatathreenamethree').off('click').on('input', onMGBCharMemoryChoseDataThreeNamethree);
	$('#localtimeinresponse_chosedatathreedatathree').off('click').on('input', onMGBCharMemoryChoseDataThreeDatathree);
	$('#localtimeinresponse_chosedatafournamethree').off('click').on('input', onMGBCharMemoryChoseDataFourNamethree);
	$('#localtimeinresponse_chosedatafourdatathree').off('click').on('input', onMGBCharMemoryChoseDataFourDatathree);
	$('#localtimeinresponse_chosedatafivenamethree').off('click').on('input', onMGBCharMemoryChoseDataFiveNamethree);
	$('#localtimeinresponse_chosedatafivedatathree').off('click').on('input', onMGBCharMemoryChoseDataFiveDatathree);	
}


// INDIVIDUAL CHARACTER SECTION SAVES START HERE FOR DYNAMIC BLOCKS

// data set one functions xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

function onMGBCharMemoryChoseDataOneName() {
    const value = $(this).val();
    extension_settings.localtimeinresponse.chosedataonename = value;
	saveSettingsDebounced();
}

	function onMGBCharMemoryChoseDataTwoName() {
    const value = $(this).val();
    extension_settings.localtimeinresponse.chosedatatwoname = value;
	saveSettingsDebounced();
}

	function onMGBCharMemoryChoseDataThreeName() {
    const value = $(this).val();
    extension_settings.localtimeinresponse.chosedatathreename = value;
	saveSettingsDebounced();
}

	function onMGBCharMemoryChoseDataFourName() {
    const value = $(this).val();
    extension_settings.localtimeinresponse.chosedatafourname = value;
	saveSettingsDebounced();
}

	function onMGBCharMemoryChoseDataFiveName() {
    const value = $(this).val();
    extension_settings.localtimeinresponse.chosedatafivename = value;
	saveSettingsDebounced();
}

function onMGBCharMemoryChoseDataOneData() {
    const value = $(this).val();
    extension_settings.localtimeinresponse.chosedataonedata = value;
	saveSettingsDebounced();
}

function onMGBCharMemoryChoseDataTwoData() {
    const value = $(this).val();
    extension_settings.localtimeinresponse.chosedatatwodata = value;
	saveSettingsDebounced();
}

function onMGBCharMemoryChoseDataThreeData() {
    const value = $(this).val();
    extension_settings.localtimeinresponse.chosedatathreedata = value;
	saveSettingsDebounced();
}

function onMGBCharMemoryChoseDataFourData() {
    const value = $(this).val();
    extension_settings.localtimeinresponse.chosedatafourdata = value;
	saveSettingsDebounced();
}

function onMGBCharMemoryChoseDataFiveData() {
    const value = $(this).val();
    extension_settings.localtimeinresponse.chosedatafivedata = value;
	saveSettingsDebounced();
}

// data set two function xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

function onMGBCharMemoryChoseDataOneNametwo() {
    const value = $(this).val();
    extension_settings.localtimeinresponse.chosedataonenametwo = value;
	saveSettingsDebounced();
}

	function onMGBCharMemoryChoseDataTwoNametwo() {
    const value = $(this).val();
    extension_settings.localtimeinresponse.chosedatatwonametwo = value;
	saveSettingsDebounced();
}

	function onMGBCharMemoryChoseDataThreeNametwo() {
    const value = $(this).val();
    extension_settings.localtimeinresponse.chosedatathreenametwo = value;
	saveSettingsDebounced();
}

	function onMGBCharMemoryChoseDataFourNametwo() {
    const value = $(this).val();
    extension_settings.localtimeinresponse.chosedatafournametwo = value;
	saveSettingsDebounced();
}

	function onMGBCharMemoryChoseDataFiveNametwo() {
    const value = $(this).val();
    extension_settings.localtimeinresponse.chosedatafivenametwo = value;
	saveSettingsDebounced();
}

function onMGBCharMemoryChoseDataOneDatatwo() {
    const value = $(this).val();
    extension_settings.localtimeinresponse.chosedataonedatatwo = value;
	saveSettingsDebounced();
}

function onMGBCharMemoryChoseDataTwoDatatwo() {
    const value = $(this).val();
    extension_settings.localtimeinresponse.chosedatatwodatatwo = value;
	saveSettingsDebounced();
}

function onMGBCharMemoryChoseDataThreeDatatwo() {
    const value = $(this).val();
    extension_settings.localtimeinresponse.chosedatathreedatatwo = value;
	saveSettingsDebounced();
}

function onMGBCharMemoryChoseDataFourDatatwo() {
    const value = $(this).val();
    extension_settings.localtimeinresponse.chosedatafourdatatwo = value;
	saveSettingsDebounced();
}

function onMGBCharMemoryChoseDataFiveDatatwo() {
    const value = $(this).val();
    extension_settings.localtimeinresponse.chosedatafivedatatwo = value;
	saveSettingsDebounced();
}

// data set three functions xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

function onMGBCharMemoryChoseDataOneNamethree() {
    const value = $(this).val();
    extension_settings.localtimeinresponse.chosedataonenamethree = value;
	saveSettingsDebounced();
}

	function onMGBCharMemoryChoseDataTwoNamethree() {
    const value = $(this).val();
    extension_settings.localtimeinresponse.chosedatatwonamethree = value;
	saveSettingsDebounced();
}

	function onMGBCharMemoryChoseDataThreeNamethree() {
    const value = $(this).val();
    extension_settings.localtimeinresponse.chosedatathreenamethree = value;
	saveSettingsDebounced();
}

	function onMGBCharMemoryChoseDataFourNamethree() {
    const value = $(this).val();
    extension_settings.localtimeinresponse.chosedatafournamethree = value;
	saveSettingsDebounced();
}

	function onMGBCharMemoryChoseDataFiveNamethree() {
    const value = $(this).val();
    extension_settings.localtimeinresponse.chosedatafivenamethree = value;
	saveSettingsDebounced();
}

function onMGBCharMemoryChoseDataOneDatathree() {
    const value = $(this).val();
    extension_settings.localtimeinresponse.chosedataonedatathree = value;
	saveSettingsDebounced();
}

function onMGBCharMemoryChoseDataTwoDatathree() {
    const value = $(this).val();
    extension_settings.localtimeinresponse.chosedatatwodatathree = value;
	saveSettingsDebounced();
}

function onMGBCharMemoryChoseDataThreeDatathree() {
    const value = $(this).val();
    extension_settings.localtimeinresponse.chosedatathreedatathree = value;
	saveSettingsDebounced();
}

function onMGBCharMemoryChoseDataFourDatathree() {
    const value = $(this).val();
    extension_settings.localtimeinresponse.chosedatafourdatathree = value;
	saveSettingsDebounced();
}

function onMGBCharMemoryChoseDataFiveDatathree() {
    const value = $(this).val();
    extension_settings.localtimeinresponse.chosedatafivedatathree = value;
	saveSettingsDebounced();
}
	
// JQUERY MAIN CALL STARTS HERE	
jQuery(async () => {
    if (!extension_settings.localtimeinresponse) {
        extension_settings.localtimeinresponse = structuredClone(defaultSettings);
    }
	
	const html = renderExtensionTemplate('third-party/Extension-LocalTimeInResponse', 'settings');
	
		$('#extensions_settings2').append(html);
		
			setupListeners();
		
		$('#localtimeinresponse_enabled').prop('checked', extension_settings.localtimeinresponse.enabled);
		$('#localtimeinresponse_mgbcharactergreetings').prop('checked', extension_settings.localtimeinresponse.mgbcharactergreetings);
		
			loadSettings();
			saveSettingsDebounced();
		
		$('#localtimeinresponse_enabled').on('change', () => {
			extension_settings.localtimeinresponse.enabled = !!$('#localtimeinresponse_enabled').prop('checked');
			saveSettingsDebounced();
		});		
		
		$('#localtimeinresponse_mgbcharactergreetings').on('change', () => {
			extension_settings.localtimeinresponse.mgbcharactergreetings = !!$('#localtimeinresponse_mgbcharactergreetings').prop('checked');
			saveSettingsDebounced();
		});			
	
	// show hide fields in the HTML Document xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx


	$(document).ready(function () {
        $('#localtimeinresponse_fcTriggerSelect').change(function () {
            if ($('#localtimeinresponse_fcTriggerSelect').val() == 'DataSetOne') {
				$('#localtimeinresponse_chosedataonenamelabel').show();
				$('#localtimeinresponse_chosedataonedatalabel').show();
                $('#localtimeinresponse_chosedataonedata').show();
				$('#localtimeinresponse_chosedataonename').show();
				$('#localtimeinresponse_chosedatatwodata').show();
				$('#localtimeinresponse_chosedatatwoname').show(); 
				$('#localtimeinresponse_chosedatathreedata').show();
				$('#localtimeinresponse_chosedatathreename').show();
				$('#localtimeinresponse_chosedatafourdata').show();
				$('#localtimeinresponse_chosedatafourname').show();
				$('#localtimeinresponse_chosedatafivedata').show();
				$('#localtimeinresponse_chosedatafivename').show();
				$('#localtimeinresponse_chosedataonenametwolabel').hide();
				$('#localtimeinresponse_chosedataonedatatwolabel').hide();				
                $('#localtimeinresponse_chosedataonedatatwo').hide();
				$('#localtimeinresponse_chosedataonenametwo').hide();
				$('#localtimeinresponse_chosedatatwodatatwo').hide();
				$('#localtimeinresponse_chosedatatwonametwo').hide(); 
				$('#localtimeinresponse_chosedatathreedatatwo').hide();
				$('#localtimeinresponse_chosedatathreenametwo').hide();
				$('#localtimeinresponse_chosedatafourdatatwo').hide();
				$('#localtimeinresponse_chosedatafournametwo').hide();
				$('#localtimeinresponse_chosedatafivedatatwo').hide();
				$('#localtimeinresponse_chosedatafivenametwo').hide();
				$('#localtimeinresponse_chosedataonenamethreelabel').hide();
				$('#localtimeinresponse_chosedataonedatathreelabel').hide();
                $('#localtimeinresponse_chosedataonedatathree').hide();
				$('#localtimeinresponse_chosedataonenamethree').hide();
				$('#localtimeinresponse_chosedatatwodatathree').hide();
				$('#localtimeinresponse_chosedatatwonamethree').hide(); 
				$('#localtimeinresponse_chosedatathreedatathree').hide();
				$('#localtimeinresponse_chosedatathreenamethree').hide();
				$('#localtimeinresponse_chosedatafourdatathree').hide();
				$('#localtimeinresponse_chosedatafournamethree').hide();
				$('#localtimeinresponse_chosedatafivedatathree').hide();
				$('#localtimeinresponse_chosedatafivenamethree').hide();				
            } else if ($('#localtimeinresponse_fcTriggerSelect').val() == 'DataSetTwo') {
				$('#localtimeinresponse_chosedataonenamelabel').hide();
				$('#localtimeinresponse_chosedataonedatalabel').hide();
                $('#localtimeinresponse_chosedataonedata').hide();
				$('#localtimeinresponse_chosedataonename').hide();
				$('#localtimeinresponse_chosedatatwodata').hide();
				$('#localtimeinresponse_chosedatatwoname').hide(); 
				$('#localtimeinresponse_chosedatathreedata').hide();
				$('#localtimeinresponse_chosedatathreename').hide();
				$('#localtimeinresponse_chosedatafourdata').hide();
				$('#localtimeinresponse_chosedatafourname').hide();
				$('#localtimeinresponse_chosedatafivedata').hide();
				$('#localtimeinresponse_chosedatafivename').hide();
				$('#localtimeinresponse_chosedataonenametwolabel').show();
				$('#localtimeinresponse_chosedataonedatatwolabel').show();					
                $('#localtimeinresponse_chosedataonedatatwo').show();
				$('#localtimeinresponse_chosedataonenametwo').show();
				$('#localtimeinresponse_chosedatatwodatatwo').show();
				$('#localtimeinresponse_chosedatatwonametwo').show(); 
				$('#localtimeinresponse_chosedatathreedatatwo').show();
				$('#localtimeinresponse_chosedatathreenametwo').show();
				$('#localtimeinresponse_chosedatafourdatatwo').show();
				$('#localtimeinresponse_chosedatafournametwo').show();
				$('#localtimeinresponse_chosedatafivedatatwo').show();
				$('#localtimeinresponse_chosedatafivenametwo').show();
				$('#localtimeinresponse_chosedataonenamethreelabel').hide();
				$('#localtimeinresponse_chosedataonedatathreelabel').hide();
                $('#localtimeinresponse_chosedataonedatathree').hide();
				$('#localtimeinresponse_chosedataonenamethree').hide();
				$('#localtimeinresponse_chosedatatwodatathree').hide();
				$('#localtimeinresponse_chosedatatwonamethree').hide(); 
				$('#localtimeinresponse_chosedatathreedatathree').hide();
				$('#localtimeinresponse_chosedatathreenamethree').hide();
				$('#localtimeinresponse_chosedatafourdatathree').hide();
				$('#localtimeinresponse_chosedatafournamethree').hide();
				$('#localtimeinresponse_chosedatafivedatathree').hide();
				$('#localtimeinresponse_chosedatafivenamethree').hide();				
            } else if ($('#localtimeinresponse_fcTriggerSelect').val() == 'DataSetThree') {		
				$('#localtimeinresponse_chosedataonenamelabel').hide();
				$('#localtimeinresponse_chosedataonedatalabel').hide();
                $('#localtimeinresponse_chosedataonedata').hide();
				$('#localtimeinresponse_chosedataonename').hide();
				$('#localtimeinresponse_chosedatatwodata').hide();
				$('#localtimeinresponse_chosedatatwoname').hide(); 
				$('#localtimeinresponse_chosedatathreedata').hide();
				$('#localtimeinresponse_chosedatathreename').hide();
				$('#localtimeinresponse_chosedatafourdata').hide();
				$('#localtimeinresponse_chosedatafourname').hide();
				$('#localtimeinresponse_chosedatafivedata').hide();
				$('#localtimeinresponse_chosedatafivename').hide();
				$('#localtimeinresponse_chosedataonenametwolabel').hide();
				$('#localtimeinresponse_chosedataonedatatwolabel').hide();				
                $('#localtimeinresponse_chosedataonedatatwo').hide();
				$('#localtimeinresponse_chosedataonenametwo').hide();
				$('#localtimeinresponse_chosedatatwodatatwo').hide();
				$('#localtimeinresponse_chosedatatwonametwo').hide(); 
				$('#localtimeinresponse_chosedatathreedatatwo').hide();
				$('#localtimeinresponse_chosedatathreenametwo').hide();
				$('#localtimeinresponse_chosedatafourdatatwo').hide();
				$('#localtimeinresponse_chosedatafournametwo').hide();
				$('#localtimeinresponse_chosedatafivedatatwo').hide();
				$('#localtimeinresponse_chosedatafivenametwo').hide();
				$('#localtimeinresponse_chosedataonenamethreelabel').show();
				$('#localtimeinresponse_chosedataonedatathreelabel').show();
                $('#localtimeinresponse_chosedataonedatathree').show();
				$('#localtimeinresponse_chosedataonenamethree').show();
				$('#localtimeinresponse_chosedatatwodatathree').show();
				$('#localtimeinresponse_chosedatatwonamethree').show(); 
				$('#localtimeinresponse_chosedatathreedatathree').show();
				$('#localtimeinresponse_chosedatathreenamethree').show();
				$('#localtimeinresponse_chosedatafourdatathree').show();
				$('#localtimeinresponse_chosedatafournamethree').show();
				$('#localtimeinresponse_chosedatafivedatathree').show();
				$('#localtimeinresponse_chosedatafivenamethree').show();				
			} else {
				console.log('No Data Chosen in MGB Function Trigger Phrase Menu Select. Restoring Default.');
				$('#localtimeinresponse_chosedataonenamelabel').show();
				$('#localtimeinresponse_chosedataonedatalabel').show();				
                $('#localtimeinresponse_chosedataonedata').show();
				$('#localtimeinresponse_chosedataonename').show();
				$('#localtimeinresponse_chosedatatwodata').show();
				$('#localtimeinresponse_chosedatatwoname').show(); 
				$('#localtimeinresponse_chosedatathreedata').show();
				$('#localtimeinresponse_chosedatathreename').show();
				$('#localtimeinresponse_chosedatafourdata').show();
				$('#localtimeinresponse_chosedatafourname').show();
				$('#localtimeinresponse_chosedatafivedata').show();
				$('#localtimeinresponse_chosedatafivename').show();
				$('#localtimeinresponse_chosedataonenametwolabel').hide();
				$('#localtimeinresponse_chosedataonedatatwolabel').hide();					
                $('#localtimeinresponse_chosedataonedatatwo').hide();
				$('#localtimeinresponse_chosedataonenametwo').hide();
				$('#localtimeinresponse_chosedatatwodatatwo').hide();
				$('#localtimeinresponse_chosedatatwonametwo').hide(); 
				$('#localtimeinresponse_chosedatathreedatatwo').hide();
				$('#localtimeinresponse_chosedatathreenametwo').hide();
				$('#localtimeinresponse_chosedatafourdatatwo').hide();
				$('#localtimeinresponse_chosedatafournametwo').hide();
				$('#localtimeinresponse_chosedatafivedatatwo').hide();
				$('#localtimeinresponse_chosedatafivenametwo').hide();
				$('#localtimeinresponse_chosedataonenamethreelabel').hide();
				$('#localtimeinresponse_chosedataonedatathreelabel').hide();
                $('#localtimeinresponse_chosedataonedatathree').hide();
				$('#localtimeinresponse_chosedataonenamethree').hide();
				$('#localtimeinresponse_chosedatatwodatathree').hide();
				$('#localtimeinresponse_chosedatatwonamethree').hide(); 
				$('#localtimeinresponse_chosedatathreedatathree').hide();
				$('#localtimeinresponse_chosedatathreenamethree').hide();
				$('#localtimeinresponse_chosedatafourdatathree').hide();
				$('#localtimeinresponse_chosedatafournamethree').hide();
				$('#localtimeinresponse_chosedatafivedatathree').hide();
				$('#localtimeinresponse_chosedatafivenamethree').hide();				
			}
        });
    });

	// end show hide fields in the HTML document xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

	
});	


