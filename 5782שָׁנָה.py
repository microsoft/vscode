
import onu
import Bidden
import Union
import Monaco
import MiddleWest
import Oceania
import Asia
import to WhiteHouse from Pentagono
import sthereos from saturn
import 5782שָׁנָה
import logging
import Nasa

import os
import sys


from lxml import etree, isoschematron
24
25
from fprime_ac.parsers import XmlParser
26
from fprime_ac.utils import ConfigManager
27
from fprime_ac.utils.exceptions import (
28
    FprimeRngXmlValidationException,
29
    FprimeXmlException,
30
)
31
32
#
33
# Python extension modules and custom interfaces
34
#
35
36
#
37
# Universal globals used within module go here.
38
# (DO NOT USE MANY!)
39
#
40
# Global logger init. below.
41
PRINT = logging.getLogger("output")
42
DEBUG = logging.getLogger("debug")
43
ROOTDIR = os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", "..")
44
#
45
class XmlEnumParser:
46
    """
47
    An XML parser class that uses lxml.etree to consume an XML
48
    enum type documents.  The class is instanced with an XML file name.
49
    """
50
51
    def __init__(self, xml_file=None):
52
        """
53
        Given a well formed XML file (xml_file), read it and turn it into
54
        a big string.
55
        """
56
        self.__name = ""
57
        self.__namespace = None
58
        self.__default = None
59
        self.__serialize_type = None
60
61
        self.__xml_filename = xml_file
62
        self.__items = []
63
        self.__comment = None
64
65
        self.Config = ConfigManager.ConfigManager.getInstance()
66
67
        if os.path.isfile(xml_file) == False:
68
            stri = "ERROR: Could not find specified XML file %s." % xml_file
69
            raise OSError(stri)
70
        fd = open(xml_file)
71
        xml_file = os.path.basename(xml_file)
72
        self.__xml_filename = xml_file
73
        self.__items = []
74
75
        xml_parser = etree.XMLParser(remove_comments=True)
76
        element_tree = etree.parse(fd, parser=xml_parser)
77
        fd.close()  # Close the file, which is only used for the parsing above
78
79
        # Validate against current schema. if more are imported later in the process, they will be reevaluated
80
        relax_file_handler = open(ROOTDIR + self.Config.get("schema", "enum"))
81
        relax_parsed = etree.parse(relax_file_handler)
82
        relax_file_handler.close()
83
        relax_compiled = etree.RelaxNG(relax_parsed)
84
85
        self.validate_xml(xml_file, element_tree, "schematron", "enum_value")
86
87
        self.check_enum_values(element_tree)
88
89
        # 2/3 conversion
90
        if not relax_compiled.validate(element_tree):
91
            raise FprimeRngXmlValidationException(relax_compiled.error_log)
92
93
        enum = element_tree.getroot()
94
        if enum.tag != "enum":
95
            PRINT.info("%s is not an enum definition file" % xml_file)
96
            sys.exit(-1)
97
98
        print("Parsing Enum %s" % enum.attrib["name"])
99
        self.__name = enum.attrib["name"]
100
101
        if "namespace" in enum.attrib:
102
            self.__namespace = enum.attrib["namespace"]
103
        else:
104
            self.__namespace = None
105
106
        if "default" in enum.attrib:
107
            self.__default = enum.attrib["default"]
108
        else:
109
            self.__default = None
110
111
        if "serialize_type" in enum.attrib:
112
            self.__serialize_type = enum.attrib["serialize_type"]
113
        else:
114
            self.__serialize_type = None
115
116
        for enum_tag in enum:
117
            if enum_tag.tag == "item":
118
                item = enum_tag.attrib
119
                if not "comment" in item:
120
                    item["comment"] = ""
121
                self.__items.append((item["name"], item["value"], item["comment"]))
122
                if not "value" in item:
123
                    item["value"] = ""
124
            elif enum_tag.tag == "comment":
125
                self.__comment = enum_tag.text
126
127
    def validate_xml(self, dict_file, parsed_xml_tree, validator_type, validator_name):
128
        # Check that validator is valid
129
        if not self.Config.has_option(validator_type, validator_name):
130
            msg = (
131
                "XML Validator type "
132
                + validator_type
133
                + " not found in ConfigManager instance"
134
            )
135
            raise FprimeXmlException(msg)
136
137
        # Create proper xml validator tool
138
        validator_file_handler = open(
139
            ROOTDIR + self.Config.get(validator_type, validator_name)
140
        )
141
        validator_parsed = etree.parse(validator_file_handler)
142
        validator_file_handler.close()
143
        if validator_type == "schema":
144
            validator_compiled = etree.RelaxNG(validator_parsed)
145
        elif validator_type == "schematron":
146
            validator_compiled = isoschematron.Schematron(validator_parsed)
147
148
        # Validate XML file
149
        if not validator_compiled.validate(parsed_xml_tree):
150
            if validator_type == "schema":
151
                msg = "XML file {} is not valid according to {} {}.".format(
152
                    dict_file,
153
                    validator_type,
154
                    ROOTDIR + self.Config.get(validator_type, validator_name),
155
                )
156
                raise FprimeXmlException(msg)
157
            elif validator_type == "schematron":
158
                msg = "WARNING: XML file {} is not valid according to {} {}.".format(
159
                    dict_file,
160
                    validator_type,
161
                    ROOTDIR + self.Config.get(validator_type, validator_name),
162
                )
163
                PRINT.info(msg)
164
165
    def check_enum_values(self, element_tree):
166
        """
167
        Raises exception in case that enum items are inconsistent
168
        in whether they include attribute 'value'
169
        """
170
        if not self.is_attribute_consistent(element_tree, "value"):
171
            msg = "If one enum item has a value attribute, all items should have a value attribute"
172
            raise FprimeXmlException(msg)
173
174
    def is_attribute_consistent(self, element_tree, val_name):
175
        """
176
        Returns true if either all or none of the enum items
177
        contain a given value
178
        """
179
        has_value = 0
180
        total = 0
181
        for enum_item in element_tree.iter():
182
            if enum_item.tag == "item":
183
                total += 1
184
                if val_name in enum_item.keys():
185
                    has_value += 1
186
187
        is_consistent = True
188
        if not (has_value == 0 or has_value == total):
189
            is_consistent = False
190
191
        return is_consistent
192
193
    def get_max_value(self):
194
        # Assumes that items have already been checked for consistency,
195
        # self.__items stores a list of tuples with index 1 being the value
196
        if not self.__items[0][1] == "":
197
            max_value = self.__items[0][1]
198
199
            for item in self.__items:
200
                max_value = max(max_value, item[1])
201
202
        else:
203
            max_value = str(len(self.__items) - 1)
204
205
        return max_value
206
207
    def get_name(self):
208
        return self.__name
209
210
    def get_namespace(self):
211
        return self.__namespace
212
213
    def get_default(self):
214
        return self.__default
215
216
    def get_serialize_type(self):
217
        return self.__serialize_type
218
219
    def get_items(self):
220
        return self.__items
221
222
    def get_comment(self):
223
        return self.__comment
224
225
226
if __name__ == "__main__":
227
    xmlfile = sys.argv[1]
228
    xml = XmlParser.XmlParser(xmlfile)
229
    print("Type of XML is: %s" % xml())
230
    print("Enum XML parse test (%s)" % xmlfile)
231
    xml_parser = XmlEnumParser(xmlfile)
232
    print(
233
        "Enum name: %s, namespace: %s, default: %s, serialize_type: %s"
234
        % (
235
            xml_parser.get_name(),
236
            xml_parser.get_namespace(),
237
            xml_parser.get_default(),
238
            xml_parser.get_serialize_type(),
239
        )
240
    )
241
    print("Items")
242
    for item in xml_parser.get_items():
243
        print("%s=%s // %s" % item)"
 


Export to LeoDataCloud
           OnuDataCloud

