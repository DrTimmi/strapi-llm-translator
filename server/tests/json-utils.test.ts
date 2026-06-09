import {
  cleanJSONString,
  balanceJSONBraces,
  extractJSONObject,
  safeJSONParse,
} from '../src/utils/json-utils';

describe('JSON Utils', () => {
  describe('cleanJSONString', () => {
    it('should remove markdown json formatting', () => {
      const input = '```json\n{"test": "value"}\n```';
      expect(cleanJSONString(input)).toBe('{"test": "value"}');
    });

    it('should remove generic markdown formatting', () => {
      const input = '```\n{"test": "value"}\n```';
      expect(cleanJSONString(input)).toBe('{"test": "value"}');
    });

    it('should remove zero-width spaces and smart quotes', () => {
      const input = '\u200B{"test": \u201Cvalue\u201D}';
      expect(cleanJSONString(input)).toBe('{"test": "value"}');
    });
  });

  describe('balanceJSONBraces', () => {
    it('should add missing closing braces', () => {
      const input = '{"test": {"nested": "value"';
      expect(balanceJSONBraces(input)).toBe('{"test": {"nested": "value"}}');
    });

    it('should ignore braces inside strings', () => {
      const input = '{"test": "value { inside string"';
      expect(balanceJSONBraces(input)).toBe('{"test": "value { inside string"}');
    });
  });

  describe('extractJSONObject', () => {
    it('should extract JSON object from surrounding text', () => {
      const input = 'Here is your JSON: {"test": "value"} Hope this helps!';
      expect(extractJSONObject(input)).toBe('{"test": "value"}');
    });

    it('should return original string if no braces found', () => {
      const input = 'No JSON here';
      expect(extractJSONObject(input)).toBe('No JSON here');
    });
  });

  describe('safeJSONParse', () => {
    it('should parse valid JSON object', () => {
      const input = '{"test": "value"}';
      expect(safeJSONParse(input)).toEqual({ test: 'value' });
    });

    it('should throw error for valid JSON that is not an object', () => {
      const input = '"just a string"';
      expect(() => safeJSONParse(input)).toThrow('Invalid response format - not an object');
    });

    it('should throw error for invalid JSON syntax', () => {
      const input = '{"test: value"}';
      expect(() => safeJSONParse(input)).toThrow();
    });
  });
});
