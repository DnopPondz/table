const mongoose = require('mongoose');

const SettingSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true
  },
  value: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  label: {
    type: String
  },
  type: {
    type: String, // 'number', 'string', 'boolean'
    default: 'string'
  }
}, { timestamps: true });

module.exports = mongoose.model('Setting', SettingSchema);
