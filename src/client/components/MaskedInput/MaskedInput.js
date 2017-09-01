import React from 'react'
import PropTypes from 'prop-types'
import InputMask from '../InputMask'

let KEYCODE_Z = 90;
let KEYCODE_Y = 89;

function isUndo(e) {
  return (e.ctrlKey || e.metaKey) && e.keyCode === (e.shiftKey ? KEYCODE_Y : KEYCODE_Z);
}

function isRedo(e) {
  return (e.ctrlKey || e.metaKey) && e.keyCode === (e.shiftKey ? KEYCODE_Z : KEYCODE_Y);
}

function getSelection(el) {
  let start, end, rangeEl, clone;

  if (el.selectionStart !== undefined) {
    start = el.selectionStart;
    end = el.selectionEnd;
  } else {
    try {
      el.focus();
      rangeEl = el.createTextRange();
      clone = rangeEl.duplicate();

      rangeEl.moveToBookmark(document.selection.createRange().getBookmark());
      clone.setEndPoint('EndToStart', rangeEl);

      start = clone.text.length;
      end = start + rangeEl.text.length;
    } catch (e) { /* not focused or not visible */ }
  }

  return { start, end };
}

function setSelection(el, selection) {
  let rangeEl;

  try {
    if (el.selectionStart !== undefined) {
      el.focus();
      el.setSelectionRange(selection.start, selection.end)
    } else {
      el.focus();
      rangeEl = el.createTextRange();
      rangeEl.collapse(true);
      rangeEl.moveStart('character', selection.start);
      rangeEl.moveEnd('character', selection.end - selection.start);
      rangeEl.select();
    }
  } catch (e) { /* not focused or not visible */ }
}

function getSeparatorRegExp(dateFormat) {
  const separator = dateFormat.split('').filter(ch => !ch.match(/[a-zA-Z]/g)).map(sep => sep)[0];
  return new RegExp(`^[\\${separator}]$`);
}

class MaskedInput extends React.Component {
  constructor(props) {
    super(props);

    this._onChange = this._onChange.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onPaste = this._onPaste.bind(this);
    this._onKeyPress = this._onKeyPress.bind(this);
  }

  componentWillMount() {
    let options = {
      pattern: this.props.mask,
      value: this.props.value,
      formatCharacters: this.props.formatCharacters
    };
    if (this.props.placeholderChar) {
      options.placeholderChar = this.props.placeholderChar;
    }
    this.mask = new InputMask(options);
  }

  componentWillReceiveProps(nextProps) {
    if (this.props.mask !== nextProps.mask && this.props.value !== nextProps.mask) {
      // if we get a new value and a new mask at the same time
      // check if the mask.value is still the initial value
      // - if so use the nextProps value
      // - otherwise the `this.mask` has a value for us (most likely from paste action)
      if (this.mask.getValue() === this.mask.emptyValue) {
        this.mask.setPattern(nextProps.mask, { value: nextProps.value });
      } else {
        this.mask.setPattern(nextProps.mask, { value: this.mask.getRawValue() });
      }
    } else if (this.props.mask !== nextProps.mask) {
      this.mask.setPattern(nextProps.mask, { value: this.mask.getRawValue() });
    } else if (this.props.value !== nextProps.value) {
      this.mask.setValue(nextProps.value);
    }
  }

  componentWillUpdate(nextProps, nextState) {
    if (nextProps.mask !== this.props.mask) {
      this._updatePattern(nextProps);
    }
  }

  componentDidUpdate(prevProps) {
    if (prevProps.mask !== this.props.mask && this.mask.selection.start) {
      this._updateInputSelection();
    }
  }

  _updatePattern(props) {
    this.mask.setPattern(props.mask, {
      value: this.mask.getRawValue(),
      selection: getSelection(this.input)
    })
  }

  _updateMaskSelection() {
    this.mask.selection = getSelection(this.input);
  }

  _updateInputSelection() {
    setSelection(this.input, this.mask.selection);
  }

  _getInsertArr(start, end) {
    const sepRegExp = getSeparatorRegExp(this.props.dateFormat);
    return this.mask.pattern.pattern.slice(start, end).map(el => {
      return sepRegExp.test(el) ? el : this.props.placeholderChar;
    });
  }

  _onChange(e) {
    let maskValue = this.mask.getValue();
    if (e.target.value !== maskValue) {
      // Cut or delete operations will have shortened the value
      if (e.target.value.length < maskValue.length) {
        let sizeDiff = maskValue.length - e.target.value.length;
        this._updateMaskSelection();
        this.mask.selection.end = this.mask.selection.start + sizeDiff;
        this.mask.backspace();
      }
      let value = this._getDisplayValue();
      e.target.value = value; // eslint-disable-line
      if (value) {
        this._updateInputSelection();
      }
    }
    if (this.props.onChange) {
      this.props.onChange(e);
    }
  }

  _onKeyDown(e) {
    if (isUndo(e)) {
      e.preventDefault();
      if (this.mask.undo()) {
        e.target.value = this._getDisplayValue(); // eslint-disable-line
        this._updateInputSelection();
        if (this.props.onChange) {
          this.props.onChange(e);
        }
      }
      return
    } else if (isRedo(e)) {
      e.preventDefault();
      if (this.mask.redo()) {
        e.target.value = this._getDisplayValue(); // eslint-disable-line
        this._updateInputSelection();
        if (this.props.onChange) {
          this.props.onChange(e);
        }
      }
      return;
    }

    if ((e.key === 'Backspace' || e.key === 'Delete') && this.props.isValid) {
      e.preventDefault();
      let { start, end } = getSelection(this.input);
      if (start < end) {
        const insertArr = this._getInsertArr(start, end);
        e.target.value = [ // eslint-disable-line
          e.target.value.slice(0, start),
        ].concat(insertArr, e.target.value.slice(end)).join('');

        this.input.selectionStart = this.input.selectionEnd = e.key === 'Backspace' ? start : end;
      } else {
        if (e.key === 'Backspace' && start > 0 || e.key === 'Delete' && start < this.mask.pattern.pattern.length) {
          const sepRegExp = getSeparatorRegExp(this.props.dateFormat);
          let removePosition = e.key === 'Delete' ? start : start - 1;
          if (!sepRegExp.test(this.mask.pattern.pattern[removePosition])) {
            e.target.value = [ // eslint-disable-line
              e.target.value.slice(0, removePosition),
              this.props.placeholderChar,
              e.target.value.slice(removePosition + 1),
            ].join('');
          }
          this.input.selectionStart = this.input.selectionEnd = e.key === 'Backspace' ? start - 1 : start + 1;
        }
      }
      return;
    }

    if (e.key === 'Backspace') {
      e.preventDefault();
      this._updateMaskSelection();
      if (this.mask.backspace()) {
        let value = this._getDisplayValue();
        e.target.value = value; // eslint-disable-line
        if (value) {
          this._updateInputSelection();
        }
        if (this.props.onChange) {
          this.props.onChange(e);
        }
      }
    }
  }

  _onKeyPress(e) {
    // Ignore modified key presses
    // Ignore enter key to allow form submission
    if (e.metaKey || e.altKey || e.ctrlKey || e.key === 'Enter') { return; }

    console.log(e.key);

    e.preventDefault();
    this._updateMaskSelection();
    if (this.mask.input((e.key || e.data))) {
      if (this.props.isValid) {
        let { start, end } = getSelection(this.input);
        const insertArr = this._getInsertArr(start + 1, end);
        e.target.value = [ // eslint-disable-line
          e.target.value.slice(0, start),
          e.key
        ].
        concat(insertArr, e.target.value.slice(end + (start === end ? 1 : 0))).
        join('');
      } else {
        e.target.value = this.mask.getValue(); // eslint-disable-line
      }
      this._updateInputSelection();
      if (this.props.onChange) {
        this.props.onChange(e);
      }
    }
  }

  _onPaste(e) {
    e.preventDefault();
    this._updateMaskSelection();
    // getData value needed for IE also works in FF & Chrome
    if (this.mask.paste(e.clipboardData.getData('Text'))) {
      e.target.value = this.mask.getValue(); // eslint-disable-line
      // Timeout needed for IE
      setTimeout(this._updateInputSelection, 0);
      if (this.props.onChange) {
        this.props.onChange(e);
      }
    }
  }

  _getDisplayValue() {
    let value = this.mask.getValue();
    return value === this.mask.emptyValue ? '' : value
  }

  _keyPressPropName() {
    if (typeof navigator !== 'undefined') {
      return navigator.userAgent.match(/Android/i) ? 'onBeforeInput' : 'onKeyPress';
    }
    return 'onKeyPress';
  }

  _getEventHandlers() {
    return {
      onChange: this._onChange,
      onKeyDown: this._onKeyDown,
      onPaste: this._onPaste,
      [this._keyPressPropName()]: this._onKeyPress
    }
  }

  focus() {
    this.input.focus();
  }

  blur() {
    this.input.blur();
  }

  render() {
    let ref = r => { this.input = r };
    let maxLength = this.mask.pattern.length;
    let value = this._getDisplayValue();

    if (this.props.isValid) {
      const arrValue = [];
      const pattern = this.mask.pattern.pattern;
      for (let i = 0; i < value.length; i++) {
        if (value[i] === '‒' && pattern[i] === ' ') {
          let prev = arrValue.pop();
          arrValue.push(' ');
          arrValue.push(prev);
        } else {
          arrValue.push(value[i]);
        }
      }
      value = arrValue.join('');
    }

    let eventHandlers = this._getEventHandlers();
    let { size = maxLength, placeholder = this.mask.emptyValue } = this.props; // eslint-disable-line

    let { placeholderChar, formatCharacters, isValid, dateFormat, ...cleanedProps } = this.props; // eslint-disable-line
    let inputProps = { ...cleanedProps, ...eventHandlers, ref, maxLength, value, size, placeholder };
    return <input {...inputProps} />
  }
}

MaskedInput.propTypes = {
  mask: PropTypes.string.isRequired,
  isValid: PropTypes.bool,
  formatCharacters: PropTypes.object,
  placeholderChar: PropTypes.string,
  onChange: PropTypes.func,
  value: PropTypes.string,
  dateFormat: PropTypes.string,
};

MaskedInput.defaultProps = {
  value: ''
};

export default MaskedInput;
