update quiz_sets
   set is_temporary = true
 where name like 'Ad hoc quiz %'
   and description like 'Generated from % selected source(s)';
